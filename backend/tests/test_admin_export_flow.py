"""외부 시스템의 학생 데이터 수집 시나리오 테스트.

`docs/2026-07-31-admin-api-usage.md`가 설명하는 흐름을 그대로 검증한다:
로그인 → 학교 목록 → 학교별 학생 페이지네이션 → 사진 presigned URL → 상세.
실제 DB·S3 없이 fake를 주입하고 ASGI로 호출한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import get_settings
from app.deps import get_admin_service
from app.main import create_app
from app.services.admin_service import AdminService
from tests.test_admin_service import FakeSessionRepo
from tests.test_auth_service import FakeStorage, FakeStudentRepo


def _build() -> tuple[object, FakeStudentRepo]:
    repo = FakeStudentRepo()
    service = AdminService(
        students=repo,
        sessions=FakeSessionRepo(),
        storage=FakeStorage(),
        settings=get_settings(),
    )
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: service
    return app, repo


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def _login(client: httpx.AsyncClient) -> str:
    settings = get_settings()
    res = await client.post(
        "/api/admin/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert res.status_code == 200, res.text
    token: str = res.json()["admin_token"]
    return token


async def _seed(repo: FakeStudentRepo) -> None:
    """한마당고 3명(1명은 사진 있음) + 다른 학교 1명."""
    for i, name in enumerate(("가은", "나연", "다현"), start=1):
        student = await repo.create(
            school="한마당고",
            grade=1,
            class_no=2,
            student_no=i,
            name=name,
            password=f"2011010{i}",
            gender="female",
            consent_privacy=True,
        )
        if name == "가은":
            await repo.update_photo_key(student.id, "uploads/photos/gaeun/photo")
    await repo.create(
        school="새싹중",
        grade=3,
        class_no=1,
        student_no=1,
        name="라온",
        password="20090909",
        gender="male",
        consent_privacy=True,
    )


async def test_external_collection_flow_returns_info_and_photo_url() -> None:
    """로그인 → 학교 목록 → 학교 필터 조회까지 한 번에 도는 전체 흐름."""
    app, repo = _build()
    await _seed(repo)
    gen = _client(app)
    client = await anext(gen)
    try:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}"}

        schools = await client.get("/api/admin/students/schools", headers=headers)
        assert schools.status_code == 200, schools.text
        assert schools.json() == ["새싹중", "한마당고"]

        res = await client.get(
            "/api/admin/students",
            params={"school": "한마당고", "limit": 100, "offset": 0, "sort": "name_asc"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 3
        assert [item["name"] for item in body["items"]] == ["가은", "나연", "다현"]

        first = body["items"][0]
        # 외부 수집에 필요한 필드가 모두 실려 온다.
        for field in ("id", "school", "grade", "class_no", "student_no", "name", "progress"):
            assert field in first
        # 사진이 있는 학생만 presigned URL(절대 URL)을 받는다.
        assert first["photo_url"].startswith("https://")
        assert [i["photo_url"] for i in body["items"][1:]] == [None, None]
    finally:
        await gen.aclose()


async def test_pagination_collects_every_student_once() -> None:
    """limit/offset을 돌려 전량 수집해도 누락·중복이 없다."""
    app, repo = _build()
    await _seed(repo)
    gen = _client(app)
    client = await anext(gen)
    try:
        headers = {"Authorization": f"Bearer {await _login(client)}"}
        collected: list[dict[str, Any]] = []
        offset = 0
        while True:
            res = await client.get(
                "/api/admin/students",
                params={"school": "한마당고", "limit": 2, "offset": offset},
                headers=headers,
            )
            assert res.status_code == 200, res.text
            body = res.json()
            collected.extend(body["items"])
            offset += 2
            if offset >= body["total"]:
                break

        assert len(collected) == 3
        assert len({item["id"] for item in collected}) == 3
    finally:
        await gen.aclose()


async def test_detail_includes_sessions_field_for_export() -> None:
    """상세 응답에 세션(답변·페르소나·카드) 컨테이너가 항상 포함된다."""
    app, repo = _build()
    await _seed(repo)
    gen = _client(app)
    client = await anext(gen)
    try:
        headers = {"Authorization": f"Bearer {await _login(client)}"}
        listed = await client.get(
            "/api/admin/students", params={"school": "새싹중"}, headers=headers
        )
        student_id = listed.json()["items"][0]["id"]

        res = await client.get(f"/api/admin/students/{student_id}", headers=headers)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "라온"
        assert body["sessions"] == []
    finally:
        await gen.aclose()


async def test_collection_without_token_is_rejected() -> None:
    """토큰 없이 외부에서 그냥 긁는 것은 막힌다."""
    app, repo = _build()
    await _seed(repo)
    gen = _client(app)
    client = await anext(gen)
    try:
        for path in ("/api/admin/students", "/api/admin/students/schools"):
            res = await client.get(path)
            assert res.status_code == 401, f"{path}: {res.text}"
    finally:
        await gen.aclose()
