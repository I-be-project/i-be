"""관리자 API로 학생 정보 + 사진을 내려받는 외부 연동 참조 구현.

서버 코드에 의존하지 않고 HTTP만 쓴다(외부 시스템에 그대로 복사해도 동작).

Usage:
  uv run python -m scripts.export_students \\
      --base-url https://api.cnu-likelion.kr \\
      --username admin --password '<비밀번호>' \\
      --out ./export

옵션:
  --school   특정 학교만 (생략 시 전체 학교)
  --page-size  페이지당 학생 수 (기본 100)
  --no-photos  사진은 건너뛰고 메타데이터만
  --detail   학생별 상세(답변·페르소나·카드)까지 수집 — 학생 수만큼 요청이 늘어난다

출력:
  <out>/students.json                                  수집한 전체 메타데이터
  <out>/photos/<학교>/<학년>-<반>/<번호>_<이름>.jpg      학생 사진

주의: photo_url은 presigned URL이고 유효기간이 1시간이다. 목록을 받은 즉시
내려받아야 하며, URL 자체를 저장해 나중에 쓰면 만료(403)된다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

# 파일명에 쓸 수 없는 문자 → 밑줄. 한글은 그대로 둔다.
_UNSAFE = re.compile(r'[\\/:*?"<>|]+')


def _safe(name: str) -> str:
    return _UNSAFE.sub("_", name).strip() or "unknown"


class AdminClient:
    """관리자 API 클라이언트 — 로그인 토큰을 보관하고 조회 요청에 실어 보낸다."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,  # 테스트에서 가짜 전송 주입용
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout, transport=transport
        )
        self._token: str | None = None

    def login(self, username: str, password: str) -> None:
        res = self._http.post("/api/admin/login", json={"username": username, "password": password})
        res.raise_for_status()
        self._token = str(res.json()["admin_token"])

    @property
    def _headers(self) -> dict[str, str]:
        if self._token is None:
            raise RuntimeError("login()을 먼저 호출해야 한다.")
        return {"Authorization": f"Bearer {self._token}"}

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        res = self._http.get(path, params=params, headers=self._headers)
        res.raise_for_status()
        return res.json()

    def schools(self) -> list[str]:
        return [str(s) for s in self._get("/api/admin/students/schools")]

    def students(self, *, school: str | None, page_size: int) -> list[dict[str, Any]]:
        """한 학교(또는 전체)의 학생을 페이지네이션으로 전량 수집."""
        collected: list[dict[str, Any]] = []
        offset = 0
        while True:
            params: dict[str, Any] = {"limit": page_size, "offset": offset}
            if school:
                params["school"] = school
            body = self._get("/api/admin/students", params)
            collected.extend(body["items"])
            offset += page_size
            if offset >= int(body["total"]) or not body["items"]:
                break
        return collected

    def detail(self, student_id: str) -> dict[str, Any]:
        result: dict[str, Any] = self._get(f"/api/admin/students/{student_id}")
        return result

    def download(self, url: str, dest: Path) -> bool:
        """presigned URL은 인증 헤더 없이 그대로 받는다. 실패 시 False."""
        try:
            res = self._http.get(url, follow_redirects=True)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            print(f"  ! 사진 다운로드 실패 {dest.name}: {exc}", file=sys.stderr)
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(res.content)
        return True

    def close(self) -> None:
        self._http.close()


def _photo_path(root: Path, student: dict[str, Any]) -> Path:
    """<out>/photos/<학교>/<학년>-<반>/<번호>_<이름>.jpg"""
    school = _safe(str(student["school"]))
    klass = f"{student['grade']}-{student['class_no']}"
    filename = f"{student['student_no']:02d}_{_safe(str(student['name']))}.jpg"
    return root / "photos" / school / klass / filename


def run(args: argparse.Namespace, *, transport: httpx.BaseTransport | None = None) -> int:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    client = AdminClient(args.base_url, transport=transport)
    try:
        client.login(args.username, args.password)
        targets = [args.school] if args.school else client.schools()
        if not targets:
            print("가입 학생이 있는 학교가 없다.", file=sys.stderr)
            return 1

        exported: list[dict[str, Any]] = []
        photo_count = 0
        for school in targets:
            students = client.students(school=school, page_size=args.page_size)
            print(f"[{school}] 학생 {len(students)}명")

            for student in students:
                record = dict(student)
                # presigned URL은 곧 만료되므로 저장하지 않고 로컬 경로로 대체한다.
                photo_url = record.pop("photo_url", None)
                record["photo_file"] = None

                if photo_url and not args.no_photos:
                    dest = _photo_path(out, student)
                    if client.download(str(photo_url), dest):
                        record["photo_file"] = str(dest.relative_to(out))
                        photo_count += 1

                if args.detail:
                    record["detail"] = client.detail(str(student["id"]))

                exported.append(record)

        manifest = out / "students.json"
        manifest.write_text(json.dumps(exported, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n학생 {len(exported)}명 · 사진 {photo_count}장 → {manifest}")
        return 0
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = " (아이디/비밀번호 확인)" if status == 401 else ""
        print(f"요청 실패 {status}{hint}: {exc.response.text[:200]}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="관리자 API로 학생 정보·사진 내려받기")
    parser.add_argument("--base-url", default="https://api.cnu-likelion.kr")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--out", default="./export")
    parser.add_argument("--school", default=None, help="특정 학교만 (생략 시 전체)")
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--no-photos", action="store_true", help="사진 없이 메타데이터만")
    parser.add_argument("--detail", action="store_true", help="학생별 상세까지 수집")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
