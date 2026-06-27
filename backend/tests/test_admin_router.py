"""/api/admin 통합 테스트 — fake 저장소/스토리지 주입, 실 DB·S3 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.config import get_settings
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
