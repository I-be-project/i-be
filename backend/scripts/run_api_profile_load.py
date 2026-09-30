"""Admin API setup -> distinct test students -> k6 -> delete only owned students.

Adapted from the user's student-flow.js. No direct DB access, JWT signing,
AI generation, image uploads, or global test-account purge.
"""

import argparse
import getpass
import json
import os
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from dotenv import dotenv_values

BACKEND = Path(__file__).resolve().parents[1]
LOAD_DIR = BACKEND / "tests" / "load"
PROFILES = ("smoke", "steady", "burst10", "burst5", "sync100", "sync300", "sync500")
DEFAULT_URL = "http://43.202.5.26:8000"


def request(client, method, path, token=None, expected=200, **kwargs):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = client.request(method, path, headers=headers, **kwargs)
    if response.status_code != expected:
        # Never echo passwords, JWTs, or PII from response bodies.
        raise ValueError(f"{method} {path}: HTTP {response.status_code}, expected {expected}")
    return response.json()


def admin_credentials(env_file):
    path = Path(env_file) if env_file else BACKEND / ".env"
    values = dotenv_values(path) if path.is_file() else {}
    username = os.environ.get("ADMIN_USERNAME") or values.get("ADMIN_USERNAME")
    password = os.environ.get("ADMIN_PASSWORD") or values.get("ADMIN_PASSWORD")
    if not username or not password:
        raise ValueError(
            "backend/.env 또는 지정한 파일에 ADMIN_USERNAME / ADMIN_PASSWORD가 필요합니다."
        )
    return {"username": username, "password": password}


def account_count(profile, journey):
    if profile.startswith("sync"):
        return int(profile[4:])
    if profile == "smoke":
        return 11 if journey == "visit" else 1
    return 550 if journey == "visit" and profile == "steady" else 500


def prepare_accounts(client, admin, count, booth, manifest, owned):
    lock = threading.Lock()
    run_id = uuid4().hex[:12]

    def create(index):
        student = request(
            client,
            "POST",
            "/api/admin/students/test",
            admin,
            expected=201,
            json={"name": f"k6-profile-{run_id}-{index:04d}", "gender": "male"},
        )
        with lock:
            owned.append(student["id"])
            manifest.write_text(json.dumps(owned), encoding="utf-8")
        token = request(client, "POST", f"/api/admin/students/test/{student['id']}/token", admin)[
            "student_token"
        ]
        # The deployed CompleteRequest stores this supplied persona; no AI endpoint is called.
        body = request(
            client,
            "POST",
            "/api/sessions/complete",
            token,
            json={
                "name": "부하 테스트 탐험가",
                "tagline": "개인 페이지 API 검증",
                "keywords": ["탐구", "협력"],
                "fields": ["과학"],
            },
        )
        if not (
            body.get("has_completed") is True
            and body.get("persona")
            and body.get("student")
            and isinstance(body.get("booths"), list)
        ):
            raise ValueError("완료 프로필 준비 실패. 배포 서버의 응답 계약을 확인하세요.")
        row = {"student_id": student["id"], "student_token": token}
        if booth:
            row.update(booth_id=booth["id"], booth_code=booth["code"])
            if not any(b["id"] == booth["id"] and not b["visited"] for b in body["booths"]):
                raise ValueError("방문 테스트 부스 또는 초기 미방문 상태를 확인하지 못했습니다.")
        return row

    # Low preparation concurrency, excluded from k6's measured phase.
    with ThreadPoolExecutor(max_workers=5) as pool:
        rows = []
        for row in pool.map(create, range(count)):
            rows.append(row)
            if len(rows) % 25 == 0 or len(rows) == count:
                print(f"테스트 계정 준비: {len(rows)}/{count}", flush=True)
        return rows


def cleanup(client, admin, owned, manifest):
    failed = []
    for student_id in list(owned):
        try:
            response = client.delete(
                f"/api/admin/students/{student_id}", headers={"Authorization": f"Bearer {admin}"}
            )
            if response.status_code not in (200, 404):
                failed.append(student_id)
        except httpx.HTTPError:
            failed.append(student_id)
    manifest.write_text(json.dumps(failed), encoding="utf-8")
    if failed:
        raise ValueError(f"이번 실행 계정 {len(failed)}개 정리 실패. 남은 ID 파일: {manifest}")
    print(f"이번 실행의 테스트 계정 {len(owned)}개 정리 완료", flush=True)


def cleanup_booth(client, admin, booth_id, manifest):
    response = client.delete(
        f"/api/admin/booths/{booth_id}", headers={"Authorization": f"Bearer {admin}"}
    )
    if response.status_code not in (200, 404):
        raise ValueError(f"이번 실행 부스 정리 실패. 남은 ID 파일: {manifest}")
    manifest.write_text("[]", encoding="utf-8")
    print("이번 실행의 임시 부스 정리 완료", flush=True)


def execute_k6(
    binary,
    profile,
    journey,
    base,
    fixture,
    output,
    competencies,
    visit_timestamp,
    script_name="profile.js",
    extra_env=None,
):
    allowed = {
        "PATH",
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "HOME",
        "USERPROFILE",
        "SMOKE_SECONDS",
        "STAGE_SECONDS",
        "RECOVERY_SECONDS",
        "P95_MS",
        "SYNC_WINDOW_MS",
    }
    env = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    env.update(
        BASE_URL=base,
        PROFILE=profile,
        JOURNEY=journey,
        ACCOUNTS_FILE=str(fixture),
        REQUIRE_CARD="0",
        REQUIRE_COMPETENCIES="1" if competencies else "0",
        REQUIRE_VISIT_TIMESTAMP="1" if visit_timestamp else "0",
        REUSE_ACCOUNT="0",
        K6_NO_USAGE_REPORT="true",
    )
    if extra_env:
        env.update(extra_env)
    command = [binary, "run", "--quiet", "--summary-export", str(output)]
    if script_name == "mixed.js":
        command.extend(["--log-output", f"file={output.with_suffix('.log')}"])
    command.append(str(LOAD_DIR / script_name))
    process = subprocess.Popen(command, env=env)
    try:
        return process.wait()
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def run(args):
    base = args.base_url.rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("경로 없는 백엔드 origin 주소가 필요합니다.")
    binary = shutil.which("k6")
    if not binary:
        raise ValueError("k6 실행 파일이 PATH에 없습니다.")
    with (
        httpx.Client(base_url=base, timeout=30, follow_redirects=False) as client,
        ExitStack() as scope,
    ):
        request(client, "GET", "/healthz")
        spec = request(client, "GET", "/openapi.json")
        paths = spec.get("paths", {})
        for path, method in [
            ("/api/admin/students/test", "post"),
            ("/api/admin/students/{student_id}", "delete"),
            ("/api/sessions/complete", "post"),
        ]:
            if method not in paths.get(path, {}):
                raise ValueError(f"필요한 API가 없습니다: {method} {path}")
        competencies = (
            "competencies" in spec["components"]["schemas"]["ProfileSummary"]["properties"]
        )
        visit_timestamp = "visited_at" in spec["components"]["schemas"].get(
            "ProfileBoothStatus", {}
        ).get("properties", {})
        credentials = (
            {
                "username": input("관리자 아이디 [admin]: ").strip() or "admin",
                "password": getpass.getpass("관리자 비밀번호: "),
            }
            if args.prompt_admin
            else admin_credentials(args.env_file)
        )
        admin = request(client, "POST", "/api/admin/login", json=credentials)["admin_token"]
        print(f"대상: {base} / 관리자 로그인 성공 / DB 직접 접속 없음", flush=True)
        print(
            "검증 범위: 완료 프로필·페르소나·부스. 이미지 생성/서명·다운로드 부하는 제외.",
            flush=True,
        )
        print(
            f"역량 점수 검증: {'포함' if competencies else '제외 (배포 서버 응답에 없음)'}",
            flush=True,
        )
        journeys = ("own", "visit") if args.journey == "all" else (args.journey,)
        root = LOAD_DIR / "results" / f"api-{uuid4()}"
        root.mkdir(parents=True)
        booth = None
        if "visit" in journeys:
            booths = request(client, "GET", "/api/admin/booths", admin)
            choices = [
                b for b in booths if not args.booth_code or b["code"] == args.booth_code.upper()
            ]
            if not choices:
                if args.booth_code:
                    raise ValueError("지정한 부스 코드가 없습니다.")
                if "delete" not in paths.get("/api/admin/booths/{booth_id}", {}):
                    raise ValueError("임시 부스를 정리할 삭제 API가 없습니다.")
                booth = request(
                    client,
                    "POST",
                    "/api/admin/booths",
                    admin,
                    expected=201,
                    json={
                        "name": f"k6-profile-{uuid4().hex[:12]}",
                        "description": "개인 페이지 부하 테스트용 임시 부스",
                    },
                )
                manifest = root / "booth-owned.json"
                scope.callback(cleanup_booth, client, admin, booth["id"], manifest)
                manifest.write_text(json.dumps([booth["id"]]), encoding="utf-8")
                choices = [booth]
                print(
                    "기존 부스가 없어 임시 테스트 부스를 생성했습니다. 종료 시 정리합니다.",
                    flush=True,
                )
            booth = next((b for b in choices if b.get("competencies")), choices[0])
        (root / "scope.json").write_text(
            json.dumps(
                {
                    "base_url": base,
                    "card_images": False,
                    "competencies": competencies,
                    "profile_visit_timestamp": visit_timestamp,
                    "distinct_accounts": True,
                    "shared": False,
                }
            ),
            encoding="utf-8",
        )
        profiles = PROFILES if args.profile == "all" else (args.profile,)
        for profile in profiles:
            for journey in journeys:
                owned = []
                manifest = root / f"{profile}-{journey}-owned.json"
                fixture = root / "accounts.local.json"
                try:
                    rows = prepare_accounts(
                        client,
                        admin,
                        account_count(profile, journey),
                        booth if journey == "visit" else None,
                        manifest,
                        owned,
                    )
                    # Verify the actual student route before applying load.
                    preview = request(client, "GET", "/api/students/me", rows[0]["student_token"])
                    if competencies and len(preview.get("competencies", [])) != 10:
                        raise ValueError("API 명세와 실제 역량 응답이 다릅니다.")
                    if journey == "visit":
                        check_booth = request(
                            client, "GET", f"/api/booths/{booth['code']}", rows[0]["student_token"]
                        )
                        if check_booth["visited"]:
                            raise ValueError("신규 계정의 부스가 이미 방문 처리되었습니다.")
                    fixture.write_text(json.dumps(rows), encoding="utf-8")
                    print(f"k6 시작: {profile}/{journey}, 서로 다른 학생 {len(rows)}명", flush=True)
                    result = execute_k6(
                        binary,
                        profile,
                        journey,
                        base,
                        fixture,
                        root / f"{profile}-{journey}.json",
                        competencies,
                        visit_timestamp,
                    )
                    if result:
                        print("기준 미달: 다음 부하 단계는 실행하지 않습니다.", flush=True)
                        return result
                finally:
                    fixture.unlink(missing_ok=True)
                    cleanup(client, admin, owned, manifest)
                    print(f"결과: {root}", flush=True)
        return 0


def main():
    parser = argparse.ArgumentParser(
        description="관리자 API로 테스트 계정 자동 준비 후 개인 페이지 k6 실행"
    )
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument(
        "--env-file", help="ADMIN_USERNAME/ADMIN_PASSWORD만 읽음. 기본 backend/.env"
    )
    parser.add_argument("--profile", choices=(*PROFILES, "all"), default="smoke")
    parser.add_argument("--journey", choices=("own", "visit", "all"), default="all")
    parser.add_argument("--booth-code")
    parser.add_argument(
        "--prompt-admin", action="store_true", help="파일 대신 관리자 정보를 직접 입력"
    )
    args = parser.parse_args()
    try:
        return run(args)
    except KeyboardInterrupt:
        return 130
    except ValueError as exc:
        print(str(exc))
        return 1
    except Exception as exc:
        print(f"실행 실패 ({type(exc).__name__}). API 연결과 설정을 확인하세요.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
