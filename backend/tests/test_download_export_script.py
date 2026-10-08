"""scripts/download_export.py — 내보내기 API 다운로드 스크립트.

MockTransport로 /api/export/v1과 S3 서명 URL을 흉내 내고, 커서 페이지네이션·이미지 저장·
재실행 시 건너뛰기·재승인 시 다시 받기를 확인한다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

from scripts.download_export import run

KEY = "k"


def _student(idx: int, *, photo: bool = True, approved_at: str | None = None) -> dict[str, Any]:
    sid = f"00000000-0000-0000-0000-00000000000{idx}"
    return {
        "id": sid,
        "name": f"학생{idx}",
        "photo_url": f"https://s3.example/photo/{sid}?sig=1" if photo else None,
        "survey": None,
        "persona": {
            "base_career": "드론 전문가",
            "approved_at": approved_at,
            "image_url": f"https://s3.example/gen/{sid}?sig=1",
        }
        if approved_at
        else None,
    }


class FakeServer:
    """2명씩 페이지를 나눠 주는 가짜 API + 이미지 서버. 받은 이미지 URL을 기록한다."""

    def __init__(self, students: list[dict[str, Any]]) -> None:
        self.students = students
        self.image_gets: list[str] = []
        self.auth_on_images: list[str | None] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.host == "s3.example":
            self.image_gets.append(req.url.path)
            self.auth_on_images.append(req.headers.get("authorization"))
            ctype = "image/png" if "/gen/" in req.url.path else "image/jpeg"
            return httpx.Response(200, content=b"img", headers={"content-type": ctype})
        if req.headers.get("authorization") != f"Bearer {KEY}":
            return httpx.Response(401, json={"detail": "unauthorized"})
        path = req.url.path
        if path.startswith("/api/export/v1/students/"):
            sid = path.rsplit("/", 1)[1]
            hit = [s for s in self.students if s["id"] == sid]
            return (
                httpx.Response(200, json=json.loads(json.dumps(hit[0])))
                if hit
                else httpx.Response(404)
            )
        cursor = req.url.params.get("cursor")
        start = (
            next(i + 1 for i, s in enumerate(self.students) if s["id"] == cursor) if cursor else 0
        )
        page = self.students[start : start + 2]
        more = start + 2 < len(self.students)
        # 매 요청 새 dict — 스크립트가 pop으로 고치므로 원본을 공유하면 안 된다.
        return httpx.Response(
            200,
            json={
                "items": json.loads(json.dumps(page)),
                "next_cursor": page[-1]["id"] if more else None,
            },
        )


def _args(out: Path, **kw: Any) -> argparse.Namespace:
    base = {
        "base_url": "https://api.example",
        "key": KEY,
        "out": str(out),
        "page_size": 2,
        "student_id": None,
        "no_images": False,
    }
    return argparse.Namespace(**{**base, **kw})


def _read(out: Path, sid: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads((out / sid / "student.json").read_text(encoding="utf-8"))
    return result


def _sid(idx: int) -> str:
    return f"00000000-0000-0000-0000-00000000000{idx}"


def test_downloads_all_pages_into_student_folders(tmp_path: Path) -> None:
    server = FakeServer(
        [_student(1, approved_at="2026-10-07T03:00:00Z"), _student(2, photo=False), _student(3)]
    )
    assert run(_args(tmp_path), transport=httpx.MockTransport(server)) == 0

    # 커서로 2페이지 → 학생 3명 모두 자기 폴더
    assert sorted(p.name for p in tmp_path.iterdir()) == [_sid(1), _sid(2), _sid(3)]
    first = _read(tmp_path, _sid(1))
    assert "photo_url" not in first and "image_url" not in first["persona"]  # 만료 URL 제거
    assert first["photo_file"] == "photo.jpg"
    assert first["persona"]["image_file"] == "persona.png"
    assert (tmp_path / _sid(1) / "photo.jpg").read_bytes() == b"img"
    assert (tmp_path / _sid(1) / "persona.png").exists()
    assert _read(tmp_path, _sid(2))["photo_file"] is None
    assert set(server.auth_on_images) == {None}  # 이미지엔 인증 헤더를 싣지 않는다


def test_rerun_skips_existing_and_refetches_on_reapproval(tmp_path: Path) -> None:
    server = FakeServer([_student(1, approved_at="2026-10-07T03:00:00Z")])
    run(_args(tmp_path), transport=httpx.MockTransport(server))
    assert len(server.image_gets) == 2

    run(_args(tmp_path), transport=httpx.MockTransport(server))
    assert len(server.image_gets) == 2  # 그대로면 다시 받지 않는다

    server.students = [_student(1, approved_at="2026-10-08T01:00:00Z")]
    run(_args(tmp_path), transport=httpx.MockTransport(server))
    assert server.image_gets[2:] == [f"/gen/{_sid(1)}"]  # 생성 이미지만 다시
    assert _read(tmp_path, _sid(1))["persona"]["approved_at"] == "2026-10-08T01:00:00Z"
    assert len(list((tmp_path / _sid(1)).glob("persona.*"))) == 1


def test_single_student_and_no_images(tmp_path: Path) -> None:
    server = FakeServer([_student(1), _student(2)])
    assert (
        run(
            _args(tmp_path, student_id=_sid(2), no_images=True),
            transport=httpx.MockTransport(server),
        )
        == 0
    )

    assert [p.name for p in tmp_path.iterdir()] == [_sid(2)]
    assert _read(tmp_path, _sid(2))["photo_file"] is None
    assert server.image_gets == []


def test_wrong_key_fails(tmp_path: Path) -> None:
    server = FakeServer([_student(1)])
    assert run(_args(tmp_path, key="wrong"), transport=httpx.MockTransport(server)) == 1
    assert list(tmp_path.iterdir()) == []
