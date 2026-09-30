"""Prepare disposable completed profiles, run k6, and remove only this run's data."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import asyncpg
import httpx

from app.config import Settings
from app.core.profile_share import profile_share_code
from app.core.security import TokenKind, create_token

BACKEND = Path(__file__).resolve().parents[1]
LOAD_DIR = BACKEND / "tests" / "load"
PROFILES = ("smoke", "steady", "burst10", "burst5", "sync100", "sync300", "sync500")


def load_settings(env_file: str | None = None) -> Settings:
    if env_file is None:
        return Settings(_env_file=BACKEND / ".env")
    path = Path(env_file).resolve()
    if not path.is_file():
        raise ValueError("지정한 테스트 설정 파일을 찾을 수 없습니다.")

    class FileSettings(Settings):
        @classmethod
        def settings_customise_sources(
            cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings
        ):
            # Never silently inherit a different DB/JWT from the shell.
            return init_settings, dotenv_settings

    settings = FileSettings(_env_file=path)
    required = {"app_env", "app_base_url", "database_url", "jwt_secret", "jwt_card_share_secret"}
    if required - settings.model_fields_set:
        missing = ", ".join(sorted(key.upper() for key in required - settings.model_fields_set))
        raise ValueError(f"테스트 설정 파일에 다음 항목이 필요합니다: {missing}")
    return settings


def validate_target(settings: Settings, base_url: str) -> None:
    if settings.app_env == "production":
        raise ValueError("자동 데이터 준비는 local/staging 설정에서만 실행합니다.")
    if not settings.database_enabled:
        raise ValueError("DATABASE_ENABLED=true와 테스트 DB 설정이 필요합니다.")
    url = urlsplit(base_url)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username
        or url.password
        or url.path not in {"", "/"}
        or url.query
        or url.fragment
    ):
        raise ValueError("BASE_URL은 경로 없는 백엔드 origin이어야 합니다.")


async def seed(
    settings: Settings, members: list[dict[str, str]], with_visit: bool = False
) -> dict | None:
    conn = await asyncpg.connect(settings.database_url, timeout=15, command_timeout=30)
    try:
        async with conn.transaction():
            target = None
            if with_visit:
                target = await conn.fetchrow(
                    """select b.id, b.code from ops.booths b
                    order by exists (select 1 from ops.booth_competencies bc where bc.booth_id=b.id) desc,
                    b.id limit 1"""
                )
                if target is None:
                    raise ValueError("방문 인증 테스트에는 테스트 DB의 부스가 최소 1개 필요합니다.")
            booths = await conn.fetch("select id from ops.booths order by id limit 10")
            if target:
                booths = [booth for booth in booths if booth["id"] != target["id"]]
            students, sessions, personas, cards, visits = [], [], [], [], []
            for index, member in enumerate(members):
                student_id = UUID(member["id"])
                session_id, persona_id = uuid4(), uuid4()
                # Synthetic keys exercise the same presigning path without uploading or AI calls.
                prefix = f"load-test/{student_id}"
                students.append(
                    (student_id, member["name"], secrets.token_urlsafe(24), f"{prefix}/photo.png")
                )
                sessions.append((session_id, student_id))
                personas.append((persona_id, session_id))
                cards.append((persona_id, f"{prefix}/card.png"))
                visits.extend(
                    (student_id, booth["id"]) for booth in booths[: (0, 3, 10)[index % 3]]
                )
            await conn.executemany(
                """insert into pii.students
                    (id, school, grade, class_no, student_no, name, password, gender,
                     consent_privacy, kind, photo_key)
                    values ($1, '', 0, 0, 0, $2, $3, 'male', true, 'test', $4)""",
                students,
            )
            await conn.executemany(
                """insert into generated.sessions (id, student_id, status, completed_at)
                    values ($1, $2, 'completed', now())""",
                sessions,
            )
            await conn.executemany(
                """insert into generated.personas (id, session_id, name, tagline, keywords, fields)
                    values ($1, $2, '테스트 탐험가', '부하 테스트용 합성 프로필',
                            '["탐구", "협력", "창의"]'::jsonb, '["과학"]'::jsonb)""",
                personas,
            )
            await conn.executemany(
                """insert into generated.cards (persona_id, card_image_key) values ($1, $2)""",
                cards,
            )
            if visits:
                await conn.executemany(
                    "insert into ops.booth_visits (student_id, booth_id) values ($1, $2)",
                    visits,
                )
            return dict(target) if target else None
    finally:
        await conn.close()


async def cleanup(settings: Settings, members: list[dict[str, str]]) -> None:
    conn = await asyncpg.connect(settings.database_url, timeout=15, command_timeout=30)
    try:
        async with conn.transaction():
            # Exact UUID + exact name + test kind. Never purge all test accounts.
            await conn.executemany(
                "delete from pii.students where id=$1 and name=$2 and kind='test'",
                [(UUID(member["id"]), member["name"]) for member in members],
            )
    finally:
        await conn.close()


async def reset_visits(settings: Settings, members: list[dict[str, str]], booth_id: UUID) -> None:
    """Reset only this run's target visits between k6 invocations, outside measured traffic."""
    conn = await asyncpg.connect(settings.database_url, timeout=15, command_timeout=30)
    try:
        async with conn.transaction():
            await conn.executemany(
                """delete from ops.booth_visits v using pii.students s
                where v.student_id=s.id and s.id=$1 and s.name=$2 and s.kind='test'
                  and v.booth_id=$3""",
                [(UUID(m["id"]), m["name"], booth_id) for m in members],
            )
    finally:
        await conn.close()


async def preflight(client: httpx.AsyncClient, base_url: str, account: dict, name: str) -> None:
    response = await client.get(
        f"{base_url}/api/students/me",
        headers={"Authorization": f"Bearer {account['student_token']}"},
    )
    if response.status_code != 200:
        raise ValueError(
            f"준비 확인 실패 (HTTP {response.status_code}). API와 .env의 DB/JWT/S3 설정을 확인하세요."
        )
    body = response.json()
    if not (
        (body.get("student") or {}).get("name") == name
        and body.get("has_completed") is True
        and body.get("persona")
        and (body.get("card") or {}).get("card_image_url")
        and isinstance(body.get("booths"), list)
        and len(body.get("competencies", [])) == 10
    ):
        raise ValueError(
            "준비한 프로필을 API가 반환하지 않습니다. 같은 DB/JWT 설정인지 확인하세요."
        )


def run_k6(
    binary: str,
    profile: str,
    base_url: str,
    accounts_file: Path,
    output: Path,
    journey: str = "own",
) -> int:
    # Don't pass DB/admin/AI secrets inherited from the shell to k6.
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"}
        or key in {"SMOKE_SECONDS", "STAGE_SECONDS", "RECOVERY_SECONDS", "P95_MS", "SYNC_WINDOW_MS"}
    }
    environment.update(
        BASE_URL=base_url,
        ACCOUNTS_FILE=str(accounts_file),
        PROFILE=profile,
        JOURNEY=journey,
        K6_NO_USAGE_REPORT="true",
    )
    process = subprocess.Popen(
        [binary, "run", "--summary-export", str(output), str(LOAD_DIR / "profile.js")],
        env=environment,
    )
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


async def run(args: argparse.Namespace, settings: Settings) -> int:
    shell_url = None if getattr(args, "env_file", None) else os.environ.get("BASE_URL")
    base_url = (args.base_url or shell_url or settings.app_base_url).rstrip("/")
    validate_target(settings, base_url)
    if args.cleanup_run:
        run_id = str(UUID(args.cleanup_run))
        manifest = LOAD_DIR / "results" / run_id / "manifest.json"
        members = json.loads(manifest.read_text(encoding="utf-8"))
        await cleanup(settings, members)
        (manifest.parent / "accounts.local.json").unlink(missing_ok=True)
        print(f"정리 완료: {run_id}", flush=True)
        return 0

    binary = shutil.which("k6")
    if not binary:
        raise ValueError("k6 실행 파일을 찾을 수 없습니다. k6 설치와 PATH를 확인하세요.")
    profiles = PROFILES if args.profile == "all" else (args.profile,)
    selected_journey = getattr(args, "journey", "own")
    journeys = ("own", "shared", "visit") if selected_journey == "all" else (selected_journey,)
    count = (
        1
        if args.profile == "smoke"
        else (int(args.profile[4:]) if args.profile.startswith("sync") else 500)
    )
    if "visit" in journeys:
        count = max(
            count, 550 if "steady" in profiles else 11 if args.profile == "smoke" else count
        )
    print(f"대상: {base_url} / 설정: {settings.app_env} / 임시 학생: {count}명", flush=True)
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        health = await client.get(f"{base_url}/healthz")
        if health.status_code != 200:
            raise ValueError("백엔드 /healthz 확인에 실패했습니다. 먼저 테스트 서버를 실행하세요.")
        run_id = str(uuid4())
        output_dir = LOAD_DIR / "results" / run_id
        output_dir.mkdir(parents=True)
        members = [{"id": str(uuid4()), "name": f"k6-{run_id[:8]}-{i:04d}"} for i in range(count)]
        (output_dir / "manifest.json").write_text(json.dumps(members), encoding="utf-8")
        accounts_file = output_dir / "accounts.local.json"
        print(f"실행 ID: {run_id}", flush=True)
        try:
            booth = await seed(settings, members, with_visit="visit" in journeys)
            print("완료 프로필 준비 완료. API 연결 확인 중…", flush=True)
            for profile in profiles:
                accounts = [
                    {
                        "student_id": member["id"],
                        "share_code": profile_share_code(UUID(member["id"]), settings),
                        **(
                            {"booth_id": str(booth["id"]), "booth_code": booth["code"]}
                            if booth
                            else {}
                        ),
                        "student_token": create_token(
                            kind=TokenKind.STUDENT,
                            subject=member["id"],
                            ttl=timedelta(hours=2),
                            settings=settings,
                        ),
                    }
                    for member in members
                ]
                accounts_file.write_text(json.dumps(accounts), encoding="utf-8")
                await preflight(client, base_url, accounts[0], members[0]["name"])
                for journey in journeys:
                    if journey == "visit":
                        await reset_visits(settings, members, booth["id"])
                    print(f"k6 시작: {profile} / {journey}", flush=True)
                    # Keep wait in the main thread so Ctrl+C terminates k6 before cleanup.
                    code = run_k6(
                        binary,
                        profile,
                        base_url,
                        accounts_file,
                        output_dir / f"{profile}-{journey}.json",
                        journey,
                    )
                    if code:
                        print(
                            f"{profile}/{journey} 실패: 다음 단계는 실행하지 않습니다.", flush=True
                        )
                        return code
            return 0
        finally:
            accounts_file.unlink(missing_ok=True)
            try:
                await cleanup(settings, members)
                print("이번 실행의 임시 학생·세션·카드·방문 기록 정리 완료.", flush=True)
            except Exception:
                print(
                    f"정리 실패. 같은 DB 설정에서 --cleanup-run {run_id}로 재시도하세요.",
                    flush=True,
                )
                raise RuntimeError("임시 데이터 정리를 완료하지 못했습니다.") from None
            print(f"결과: {output_dir}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="학생 JSON 없이 개인 페이지 k6 실행")
    parser.add_argument("--profile", choices=(*PROFILES, "all"), default="smoke")
    parser.add_argument("--journey", choices=("own", "shared", "visit", "all"), default="all")
    parser.add_argument("--base-url", help="기본: BASE_URL 또는 backend/.env의 APP_BASE_URL")
    parser.add_argument("--cleanup-run", help="중단된 실행 ID의 데이터만 정리")
    parser.add_argument(
        "--env-file", help="테스트 서버 전용 설정 파일 (기존 .env와 셸 설정에서 분리)"
    )
    args = parser.parse_args()
    try:
        settings = load_settings(args.env_file)
        return asyncio.run(run(args, settings))
    except KeyboardInterrupt:
        print("사용자가 테스트를 중단했습니다.")
        return 130
    except ValueError as exc:
        # Avoid printing Pydantic settings validation errors (may contain secrets).
        if type(exc) is ValueError:
            print(str(exc))
        else:
            print("설정 검증 실패. 사용 중인 설정 파일의 필수 항목을 확인하세요.")
        return 1
    except Exception as exc:
        print(f"실행 실패 ({type(exc).__name__}). 테스트 서버, DB 연결, 마이그레이션을 확인하세요.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
