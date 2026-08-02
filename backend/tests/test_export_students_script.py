"""scripts/export_students.py — 외부 수집 스크립트 테스트.

MockTransport로 관리자 API와 S3 presigned URL을 흉내 내고,
페이지네이션·사진 저장·매니페스트 생성이 맞는지 확인한다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

from scripts.export_students import run

PHOTO_BYTES = b"\xff\xd8\xff\xe0fake-jpeg"
SIGNED_URL = "https://signed.example/uploads/photos/gaeun?sig=abc"


def _student(idx: int, *, name: str, with_photo: bool) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-00000000000{idx}",
        "school": "한마당고",
        "grade": 1,
        "class_no": 2,
        "student_no": idx,
        "name": name,
        "password": f"2011010{idx}",
        "gender": "female",
        "photo_url": SIGNED_URL if with_photo else None,
        "consent_privacy": True,
        "created_at": "2026-07-31T00:00:00Z",
        "progress": {"status": "completed", "stages_done": ["q1to6"]},
    }


ALL_STUDENTS = [
    _student(1, name="가은", with_photo=True),
    _student(2, name="나연", with_photo=False),
    _student(3, name="다현", with_photo=True),
]


class Recorder:
    """호출된 경로를 기록하는 가짜 API."""

    def __init__(self) -> None:
        self.paths: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        self.paths.append(str(url))

        if url.host == "signed.example":
            return httpx.Response(200, content=PHOTO_BYTES)
        if url.path == "/api/admin/login":
            return httpx.Response(200, json={"admin_token": "fake-admin-token"})

        # 로그인 이후 모든 조회는 Bearer 토큰을 달고 나가야 한다.
        assert request.headers.get("Authorization") == "Bearer fake-admin-token"

        if url.path == "/api/admin/students/schools":
            return httpx.Response(200, json=["한마당고"])
        if url.path == "/api/admin/students":
            limit = int(url.params["limit"])
            offset = int(url.params["offset"])
            return httpx.Response(
                200,
                json={"total": len(ALL_STUDENTS), "items": ALL_STUDENTS[offset : offset + limit]},
            )
        if url.path.startswith("/api/admin/students/"):
            return httpx.Response(200, json={"id": url.path.rsplit("/", 1)[-1], "sessions": []})
        return httpx.Response(404, json={"detail": "not found"})


def _args(out: Path, **overrides: Any) -> argparse.Namespace:
    base: dict[str, Any] = {
        "base_url": "https://api.test",
        "username": "admin",
        "password": "pw",
        "out": str(out),
        "school": None,
        "page_size": 2,  # 3명을 2+1로 나눠 페이지네이션을 강제
        "no_photos": False,
        "detail": False,
    }
    base.update(overrides)
    return argparse.Namespace(**base)


def test_export_writes_manifest_and_photos(tmp_path: Path) -> None:
    recorder = Recorder()
    code = run(_args(tmp_path), transport=httpx.MockTransport(recorder))

    assert code == 0

    manifest = json.loads((tmp_path / "students.json").read_text(encoding="utf-8"))
    assert len(manifest) == 3
    assert [m["name"] for m in manifest] == ["가은", "나연", "다현"]

    # 만료되는 presigned URL 대신 로컬 경로가 남는다.
    assert all("photo_url" not in m for m in manifest)
    assert manifest[0]["photo_file"] == "photos/한마당고/1-2/01_가은.jpg"
    assert manifest[1]["photo_file"] is None

    photo = tmp_path / "photos" / "한마당고" / "1-2" / "01_가은.jpg"
    assert photo.read_bytes() == PHOTO_BYTES
    # 사진 없는 학생 파일은 만들지 않는다.
    assert not (tmp_path / "photos" / "한마당고" / "1-2" / "02_나연.jpg").exists()


def test_export_paginates_until_total(tmp_path: Path) -> None:
    recorder = Recorder()
    run(_args(tmp_path), transport=httpx.MockTransport(recorder))

    list_calls = [p for p in recorder.paths if "/api/admin/students?" in p]
    assert len(list_calls) == 2  # page_size=2 → offset 0, 2
    assert "offset=0" in list_calls[0]
    assert "offset=2" in list_calls[1]


def test_no_photos_flag_skips_download(tmp_path: Path) -> None:
    recorder = Recorder()
    run(_args(tmp_path, no_photos=True), transport=httpx.MockTransport(recorder))

    assert not (tmp_path / "photos").exists()
    assert not any("signed.example" in p for p in recorder.paths)


def test_detail_flag_fetches_each_student(tmp_path: Path) -> None:
    recorder = Recorder()
    run(_args(tmp_path, detail=True), transport=httpx.MockTransport(recorder))

    manifest = json.loads((tmp_path / "students.json").read_text(encoding="utf-8"))
    assert all("detail" in m for m in manifest)
    detail_calls = [p for p in recorder.paths if "/api/admin/students/0" in p]
    assert len(detail_calls) == 3


def test_wrong_password_reports_failure(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "아이디 또는 비밀번호가 올바르지 않습니다."})

    code = run(_args(tmp_path), transport=httpx.MockTransport(handler))

    assert code == 1
    assert not (tmp_path / "students.json").exists()


def test_photo_download_failure_keeps_going(tmp_path: Path) -> None:
    """사진 한 장이 만료·실패해도 나머지 수집은 계속된다."""

    recorder = Recorder()

    def flaky(request: httpx.Request) -> httpx.Response:
        if request.url.host == "signed.example":
            return httpx.Response(403, text="expired")
        return recorder(request)

    code = run(_args(tmp_path), transport=httpx.MockTransport(flaky))

    assert code == 0
    manifest = json.loads((tmp_path / "students.json").read_text(encoding="utf-8"))
    assert len(manifest) == 3
    assert all(m["photo_file"] is None for m in manifest)
