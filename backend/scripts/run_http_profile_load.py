"""HTTP-only runner: no .env loading, DB connections, signing keys, or data cleanup."""

import argparse
import base64
import getpass
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

LOAD_DIR = Path(__file__).resolve().parents[1] / "tests" / "load"
PROFILES = ("smoke", "steady", "burst10", "burst5", "sync100", "sync300", "sync500")
DEFAULT_URL = "http://43.202.5.26:8000"


def get_json(client, method, path, **kwargs):
    response = client.request(method, path, **kwargs)
    if response.status_code != 200:
        raise ValueError(
            f"{method} {path}: HTTP {response.status_code}. 로그인 정보와 API 응답을 확인하세요."
        )
    return response.json()


def authenticate(client):
    token = os.environ.get("K6_STUDENT_TOKEN")
    if not token:
        mode = input("인증 방법: 1=학생 로그인, 2=기존 학생 토큰 [1]: ").strip() or "1"
        if mode == "2":
            token = getpass.getpass("학생 토큰 (입력 숨김): ").strip()
        elif mode == "1":
            payload = {"name": input("학생 이름: ").strip()}
            school = input("학교 이름 (개인 참여자는 Enter): ").strip()
            if school:
                payload.update(
                    school=school,
                    grade=int(input("학년: ")),
                    class_no=int(input("반: ")),
                    student_no=int(input("번호: ")),
                )
            payload["password"] = getpass.getpass("학생 비밀번호 (입력 숨김): ")
            token = get_json(client, "POST", "/api/auth/login", json=payload)["student_token"]
        else:
            raise ValueError("인증 방법은 1 또는 2입니다.")
    try:
        segment = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))
        if claims.get("kind") != "student":
            raise ValueError()
        return {"student_id": claims["sub"], "student_token": token}
    except (ValueError, KeyError, IndexError):
        raise ValueError("유효한 학생 토큰이 필요합니다.") from None


def prepare(client, account, journey, booth_code):
    headers = {"Authorization": f"Bearer {account['student_token']}"}
    profile = get_json(client, "GET", "/api/students/me", headers=headers)
    if not (
        profile.get("has_completed")
        and profile.get("persona")
        and (profile.get("card") or {}).get("card_image_url")
        and profile.get("student")
        and isinstance(profile.get("booths"), list)
        and len(profile.get("competencies", [])) == 10
    ):
        raise ValueError(
            "이 테스트에는 완료된 페르소나·카드·부스·역량 정보가 있는 기존 학생이 필요합니다."
        )
    if journey == "own":
        return account
    booth = get_json(client, "GET", f"/api/booths/{booth_code}", headers=headers)
    # Student booth API has no UUID. Match its unique name to the profile's booth list.
    matches = [b for b in profile["booths"] if b["name"] == booth["name"]]
    if len(matches) != 1 or matches[0]["visited"] != booth["visited"]:
        raise ValueError(
            "부스 이름이 중복되었거나 방문 상태가 바뀌었습니다. 부스 선택 후 다시 실행하세요."
        )
    target = matches[0]
    return {
        **account,
        "booth_code": booth["code"],
        "booth_id": target["id"],
        "was_visited": booth["visited"],
        "visited_at": booth.get("visited_at"),
        "baseline": profile["competencies"],
        "booth_competencies": target.get("competencies", []),
    }


def run(args):
    binary = shutil.which("k6")
    if not binary:
        raise ValueError("k6가 PATH에 없습니다.")
    base = args.base_url.rstrip("/")
    url = urlsplit(base)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username
        or url.password
        or url.path
        or url.query
        or url.fragment
    ):
        raise ValueError("백엔드 origin 주소만 입력하세요.")
    print(f"HTTP 전용 대상: {base} (DB 설정을 읽거나 DB에 직접 접속하지 않음)", flush=True)
    with httpx.Client(base_url=base, timeout=15, follow_redirects=False) as client:
        get_json(client, "GET", "/healthz")
        if args.check_only:
            print("서버 연결 정상. 공유 페이지는 테스트 대상에서 제외합니다.")
            return 0
        account = authenticate(client)
        journeys = ("own", "visit") if args.journey == "all" else (args.journey,)
        booth_code = args.booth_code
        if "visit" in journeys:
            booth_code = (booth_code or input("테스트할 부스 코드 (6자리): ")).strip().upper()
            if len(booth_code) != 6 or not booth_code.isalnum():
                raise ValueError("부스 코드는 영문/숫자 6자리입니다.")
            print(
                "방문 인증은 실제 API에 기록됩니다. 기존 방문은 중복 인증으로 처리하며 자동 삭제하지 않습니다.",
                flush=True,
            )
        print(
            "기존 학생 1명의 토큰을 재사용합니다. 500 VU는 같은 학생의 동시 요청이며 서로 다른 학생 500명 테스트는 아닙니다.",
            flush=True,
        )
        output = LOAD_DIR / "results" / f"http-{uuid4()}"
        output.mkdir(parents=True)
        fixture = output / "accounts.local.json"
        profiles = PROFILES if args.profile == "all" else (args.profile,)
        try:
            for profile in profiles:
                for journey in journeys:
                    fixture.write_text(
                        json.dumps([prepare(client, account, journey, booth_code)]),
                        encoding="utf-8",
                    )
                    environment = {
                        k: v
                        for k, v in os.environ.items()
                        if k.upper()
                        in {
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
                    }
                    environment.update(
                        BASE_URL=base,
                        ACCOUNTS_FILE=str(fixture),
                        PROFILE=profile,
                        JOURNEY="visit-existing" if journey == "visit" else "own",
                        REUSE_ACCOUNT="1",
                        K6_NO_USAGE_REPORT="true",
                    )
                    print(f"시작: {profile}/{journey}", flush=True)
                    child = subprocess.Popen(
                        [
                            binary,
                            "run",
                            "--summary-export",
                            str(output / f"{profile}-{journey}.json"),
                            str(LOAD_DIR / "profile.js"),
                        ],
                        env=environment,
                    )
                    try:
                        code = child.wait()
                    finally:
                        if child.poll() is None:
                            child.terminate()
                            try:
                                child.wait(timeout=15)
                            except subprocess.TimeoutExpired:
                                child.kill()
                                child.wait()
                    if code:
                        return code
            return 0
        finally:
            fixture.unlink(missing_ok=True)
            print(f"결과: {output}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="기존 백엔드에 HTTP 요청만 보내는 k6 실행기")
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--profile", choices=(*PROFILES, "all"), default="smoke")
    parser.add_argument("--journey", choices=("own", "visit", "all"), default="own")
    parser.add_argument("--booth-code")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        return run(args)
    except KeyboardInterrupt:
        return 130
    except ValueError as exc:
        print(str(exc))
        return 1
    except Exception as exc:
        print(f"실행 실패: {type(exc).__name__}. 서버 연결 또는 입력 정보를 확인하세요.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
