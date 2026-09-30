"""One-use loopback login form for a user-assisted remote k6 run."""

import base64
import html
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs
from uuid import uuid4

import httpx

BASE_URL = "http://43.202.5.26:8000"
LOAD_DIR = Path(__file__).resolve().parents[1] / "tests" / "load"


def main():
    nonce = secrets.token_urlsafe(24)
    output = LOAD_DIR / f"accounts.login.{uuid4()}.json"
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log credentials, tokens, or form bodies.

        def page(self, content, status=200):
            body = content.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
            )
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != f"/{nonce}":
                self.page("Not found", 404)
                return
            self.page(f"""<!doctype html><html lang="ko"><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><title>부하 테스트 로그인</title>
            <style>body{{font:16px system-ui;background:#f3f5f8;margin:0;padding:28px;color:#172033}}
            main{{max-width:560px;margin:auto;background:white;padding:28px;border-radius:16px}}
            label{{display:block;margin:14px 0 5px}}input,button{{box-sizing:border-box;width:100%;padding:11px;border:1px solid #bac4d4;border-radius:7px;font:inherit}}
            button{{margin-top:22px;background:#245ce6;color:white;border:0;cursor:pointer}}small,p{{line-height:1.6}}details{{margin-top:20px}}</style>
            <main><h1>테스트 계정 로그인</h1><p>대상: {BASE_URL}<br>기존 학생 계정으로 로그인해주세요. 계정을 생성하거나 삭제하지 않습니다.</p>
            <form method="post" autocomplete="off"><input type="hidden" name="csrf" value="{nonce}">
            <label>학생 이름</label><input name="name" autocomplete="off">
            <label>학교 이름</label><input name="school" placeholder="개인 참여자는 비워두세요">
            <label>학년 / 반 / 번호 (학교 소속 학생만)</label>
            <input name="grade" type="number" placeholder="학년"><input name="class_no" type="number" placeholder="반">
            <input name="student_no" type="number" placeholder="번호">
            <label>비밀번호</label><input name="password" type="password" autocomplete="off">
            <details><summary>관리자 발급 테스트 계정: 학생 토큰으로 연결</summary>
            <p>토큰을 입력하면 위 로그인 정보는 사용하지 않습니다.</p>
            <input name="student_token" type="password" placeholder="학생 JWT" autocomplete="off"></details>
            <button type="submit">로그인하고 테스트 준비</button></form>
            <p><small>이 창에서 부하 테스트가 바로 시작되지는 않습니다. 로그인 성공 후 제가 기본 테스트부터 진행합니다.</small></p></main></html>""")

        def do_POST(self):
            expected_origin = f"http://127.0.0.1:{self.server.server_port}"
            if (
                self.path != f"/{nonce}"
                or self.headers.get("Origin", expected_origin) != expected_origin
            ):
                self.page("Forbidden", 403)
                return
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 16384:
                self.page("Invalid form", 400)
                return
            values = parse_qs(self.rfile.read(size).decode("utf-8"))
            def value(key):
                return values.get(key, [""])[0]
            if not secrets.compare_digest(value("csrf"), nonce):
                self.page("Forbidden", 403)
                return
            try:
                with httpx.Client(base_url=BASE_URL, timeout=15, follow_redirects=False) as client:
                    token = value("student_token").strip()
                    if not token:
                        payload = {"name": value("name").strip(), "password": value("password")}
                        if value("school").strip():
                            payload.update(
                                school=value("school").strip(),
                                **{
                                    key: int(value(key))
                                    for key in ("grade", "class_no", "student_no")
                                },
                            )
                        response = client.post("/api/auth/login", json=payload)
                        if response.status_code != 200:
                            raise ValueError(
                                f"로그인 실패: HTTP {response.status_code}. 계정 정보를 확인해주세요."
                            )
                        token = response.json()["student_token"]
                    profile = client.get(
                        "/api/students/me", headers={"Authorization": f"Bearer {token}"}
                    )
                    if profile.status_code != 200:
                        raise ValueError(f"프로필 조회 실패: HTTP {profile.status_code}.")
                    segment = token.split(".")[1]
                    claims = json.loads(
                        base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
                    )
                    if claims.get("kind") != "student":
                        raise ValueError("학생 토큰이 필요합니다.")
                    with output.open("x", encoding="utf-8") as target:
                        json.dump([{"student_id": claims["sub"], "student_token": token}], target)
                self.page(
                    "<meta charset='utf-8'><h2>로그인 완료</h2><p>이 창을 닫아도 됩니다. 채팅에서 테스트를 이어갑니다.</p>"
                )
                print(f"LOGIN_COMPLETE {output}", flush=True)
                done.set()
            except ValueError as exc:
                # Parsing failures must not echo any submitted value.
                message = (
                    str(exc)
                    if str(exc).startswith(("로그인 실패", "프로필 조회 실패", "학생 토큰"))
                    else "입력 형식을 확인해주세요."
                )
                self.page(
                    f"<meta charset='utf-8'><p>{html.escape(message)}</p><a href='/{nonce}'>다시 입력</a>",
                    400,
                )
            except Exception:
                self.page(
                    f"<meta charset='utf-8'><p>연결에 실패했습니다.</p><a href='/{nonce}'>다시 입력</a>",
                    502,
                )

    with HTTPServer(("127.0.0.1", 0), Handler) as server:
        server.timeout = 1
        timer = threading.Timer(900, done.set)
        timer.daemon = True
        timer.start()
        print(f"LOGIN_URL http://127.0.0.1:{server.server_port}/{nonce}", flush=True)
        try:
            while not done.is_set():
                server.handle_request()
        finally:
            timer.cancel()


if __name__ == "__main__":
    main()
