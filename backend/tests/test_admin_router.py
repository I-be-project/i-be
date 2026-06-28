"""/api/admin 통합 테스트 — fake 저장소/스토리지 주입, 실 DB·S3 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_admin_service
from app.main import create_app
from app.services.admin_service import AdminService
from tests.test_auth_service import FakeStorage, FakeStudentRepo


def _build() -> tuple[object, FakeStudentRepo, FakeStorage]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    service = AdminService(students=repo, storage=storage, settings=get_settings())
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: service
    return app, repo, storage


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_login_success_returns_admin_token() -> None:
    settings = get_settings()
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert res.status_code == 200, res.text
        assert res.json()["admin_token"]
    finally:
        await gen.aclose()


async def test_login_wrong_credentials_unauthorized() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "definitely-wrong"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


def _admin_token() -> str:
    settings = get_settings()
    from datetime import timedelta

    return create_token(
        kind=TokenKind.ADMIN, subject="admin",
        ttl=timedelta(hours=1), settings=settings,
    )


async def test_students_requires_admin_token() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/students")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_rejects_student_token() -> None:
    from datetime import timedelta

    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        student_tok = create_token(
            kind=TokenKind.STUDENT, subject="00000000-0000-0000-0000-000000000000",
            ttl=timedelta(hours=1), settings=get_settings(),
        )
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {student_tok}"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_lists_with_admin_token() -> None:
    app, repo, _ = _build()
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "홍길동"
        assert body["items"][0]["password"] == "20100101"
    finally:
        await gen.aclose()
