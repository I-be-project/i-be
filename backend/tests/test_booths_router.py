"""/api/admin/booths 통합 테스트 — fake 리포지토리 주입, 실 DB 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_booth_service
from app.main import create_app
from app.services.booth_service import BoothService
from tests.test_booth_service import FakeBoothRepo


def _build() -> tuple[object, FakeBoothRepo]:
    repo = FakeBoothRepo()
    # FakeBoothRepo는 BoothRepository의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    app = create_app()
    app.dependency_overrides[get_booth_service] = lambda: service
    return app, repo


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _admin_token() -> str:
    return create_token(
        kind=TokenKind.ADMIN,
        subject="admin",
        ttl=timedelta(hours=1),
        settings=get_settings(),
    )


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {_admin_token()}"}


def _student_token() -> str:
    return create_token(
        kind=TokenKind.STUDENT,
        subject="00000000-0000-0000-0000-000000000000",
        ttl=timedelta(hours=1),
        settings=get_settings(),
    )


def _student_auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {_student_token()}"}


async def test_create_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/admin/booths", json={"name": "드론 체험"})
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_create_rejects_student_token() -> None:
    """관리자 토큰과 같은 JWT_SECRET으로 서명되지만 kind가 다른 학생 토큰은 거부된다."""
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/booths", json={"name": "드론 체험"}, headers=_student_auth()
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_list_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/booths")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_list_rejects_student_token() -> None:
    """관리자 토큰과 같은 JWT_SECRET으로 서명되지만 kind가 다른 학생 토큰은 거부된다."""
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/booths", headers=_student_auth())
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_create_returns_code_and_qr_url() -> None:
    settings = get_settings()
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/booths",
            json={"name": "드론 체험", "description": "드론을 직접 조종해보는 부스"},
            headers=_auth(),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert len(body["code"]) == 6
        assert body["qr_url"] == f"{settings.frontend_origin.rstrip('/')}/b/{body['code']}"
        assert body["name"] == "드론 체험"
    finally:
        await gen.aclose()


async def test_create_rejects_blank_name() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/admin/booths", json={"name": "   "}, headers=_auth())
        assert res.status_code == 422
    finally:
        await gen.aclose()


async def test_list_returns_created_booths() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        await client.post("/api/admin/booths", json={"name": "부스2"}, headers=_auth())

        res = await client.get("/api/admin/booths", headers=_auth())
        assert res.status_code == 200, res.text
        assert [b["name"] for b in res.json()] == ["부스1", "부스2"]
    finally:
        await gen.aclose()


async def test_patch_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch(f"/api/admin/booths/{uuid4()}", json={"name": "이름 변경"})
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_patch_ignores_code_and_keeps_it() -> None:
    """code는 요청 스키마에 없다. 실어 보내도 무시되고 기존 코드가 유지된다."""
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        created = (
            await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        ).json()

        res = await client.patch(
            f"/api/admin/booths/{created['id']}",
            json={"name": "이름 변경", "code": "AAAAAA"},
            headers=_auth(),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "이름 변경"
        assert body["code"] == created["code"]
    finally:
        await gen.aclose()


async def test_patch_missing_booth_returns_404() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch(
            f"/api/admin/booths/{uuid4()}", json={"name": "없음"}, headers=_auth()
        )
        assert res.status_code == 404
    finally:
        await gen.aclose()


async def test_delete_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.delete(f"/api/admin/booths/{uuid4()}")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_delete_removes_booth() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        created = (
            await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        ).json()

        res = await client.delete(f"/api/admin/booths/{created['id']}", headers=_auth())
        assert res.status_code == 200, res.text
        assert res.json()["booth_id"] == created["id"]

        remaining = await client.get("/api/admin/booths", headers=_auth())
        assert remaining.json() == []
    finally:
        await gen.aclose()


async def test_delete_missing_booth_returns_404() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.delete(f"/api/admin/booths/{uuid4()}", headers=_auth())
        assert res.status_code == 404
    finally:
        await gen.aclose()


@pytest.mark.anyio
async def test_create_booth_rejects_unknown_zone() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "부스", "zone": "Z"},
            headers=_auth(),
        )
        assert res.status_code == 422


@pytest.mark.anyio
async def test_create_booth_returns_zone() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "드론 시뮬레이션", "zone": "F"},
            headers=_auth(),
        )
        assert res.status_code == 201
        assert res.json()["zone"] == "F"


@pytest.mark.anyio
async def test_create_booth_rejects_unknown_competency() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "부스", "competencies": ["없는역량"]},
            headers=_auth(),
        )
        assert res.status_code == 422
