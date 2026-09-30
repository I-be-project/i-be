"""Prepare 50 owned booths and 3,000 test students; run a three-minute mixed session."""

import argparse
import getpass
import json
import shutil
from contextlib import ExitStack
from uuid import uuid4

import httpx

from scripts.run_api_profile_load import (
    DEFAULT_URL,
    LOAD_DIR,
    admin_credentials,
    cleanup,
    cleanup_booth,
    execute_k6,
    prepare_accounts,
    request,
)


def run(args):
    binary = shutil.which("k6")
    if not binary:
        raise ValueError("k6 executable not found")
    root = LOAD_DIR / "results" / f"mixed-{uuid4()}"
    root.mkdir(parents=True)
    print(f"결과 폴더: {root}", flush=True)
    with (
        httpx.Client(base_url=args.base_url.rstrip("/"), timeout=30) as client,
        ExitStack() as scope,
    ):
        spec = request(client, "GET", "/openapi.json")
        for path, method in [
            ("/api/admin/booths/{booth_id}", "delete"),
            ("/api/admin/students/{student_id}", "delete"),
        ]:
            if method not in spec["paths"].get(path, {}):
                raise ValueError(f"Missing cleanup API: {path}")
        credentials = (
            {
                "username": input("관리자 아이디 [admin]: ").strip() or "admin",
                "password": getpass.getpass("관리자 비밀번호: "),
            }
            if args.prompt_admin
            else admin_credentials(args.env_file)
        )
        admin = request(client, "POST", "/api/admin/login", json=credentials)["admin_token"]
        booths = []
        for i in range(args.booths):
            booth = request(
                client,
                "POST",
                "/api/admin/booths",
                admin,
                expected=201,
                json={
                    "name": f"k6-mixed-{root.name[-12:]}-{i:02d}",
                    "description": "3분 혼합 부하 테스트용 임시 부스",
                },
            )
            manifest = root / f"booth-{i}-owned.json"
            scope.callback(cleanup_booth, client, admin, booth["id"], manifest)
            manifest.write_text(json.dumps([booth["id"]]), encoding="utf-8")
            booths.append({"id": booth["id"], "code": booth["code"]})
        print(f"임시 부스 {len(booths)}개 준비 완료", flush=True)
        owned = []
        manifest = root / "students-owned.json"
        scope.callback(cleanup, client, admin, owned, manifest)
        fixture = root / "accounts.local.json"
        scope.callback(fixture.unlink, missing_ok=True)
        rows = prepare_accounts(client, admin, args.users, booths[0], manifest, owned)
        preview = request(client, "GET", "/api/students/me", rows[0]["student_token"])
        ids = {b["id"] for b in preview["booths"]}
        if not all(b["id"] in ids for b in booths):
            raise ValueError("Prepared booths missing from student profile")
        fixture.write_text(json.dumps(rows), encoding="utf-8")
        booth_file = root / "booths.json"
        booth_file.write_text(json.dumps(booths), encoding="utf-8")
        (root / "scope.json").write_text(
            json.dumps(
                {
                    "base_url": args.base_url,
                    "students": args.users,
                    "test_booths": args.booths,
                    "total_booths_in_profile": len(ids),
                    "duration_seconds": args.seconds,
                    "model": "constant-vus, each student has one VU, 0-15s initial jitter",
                    "actions": "50% own, 20% booth browse, 30% visit then own",
                    "think_seconds": [3, 8],
                    "shared": False,
                    "card_images": False,
                    "competency_validation": False,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"혼합 부하 시작: {args.users}명 / {args.booths}부스 / {args.seconds}초", flush=True)
        return execute_k6(
            binary,
            "mixed",
            "mixed",
            args.base_url.rstrip("/"),
            fixture,
            root / "mixed.json",
            False,
            False,
            script_name="mixed.js",
            extra_env={
                "MIXED_USERS": str(args.users),
                "MIXED_SECONDS": str(args.seconds),
                "BOOTHS_FILE": str(booth_file),
            },
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--users", type=int, default=3000)
    parser.add_argument("--booths", type=int, default=50)
    parser.add_argument("--seconds", type=int, default=180)
    parser.add_argument("--env-file")
    parser.add_argument("--prompt-admin", action="store_true")
    args = parser.parse_args()
    if min(args.users, args.booths, args.seconds) < 1:
        parser.error("Counts and duration must be positive")
    try:
        return run(args)
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"혼합 테스트 실패: {type(exc).__name__}: {exc}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
