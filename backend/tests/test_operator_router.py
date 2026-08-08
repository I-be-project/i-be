"""/api/operator 통합 테스트 — 실 DB 없이 설정만으로 검증."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import jwt

from app.config import get_settings
from app.core.security import TokenKind
from app.main import create_app


async def _client() -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_login_success_returns_operator_token() -> None:
    settings = get_settings()
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/operator/login", json={"password": settings.operator_password}
        )
        assert res.status_code == 200
        token = res.json()["operator_token"]
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
        )
        assert payload["kind"] == TokenKind.OPERATOR.value
        assert payload["sub"] == "operator"
    finally:
        await gen.aclose()


async def test_login_wrong_password_returns_401() -> None:
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post("/api/operator/login", json={"password": "틀린비밀번호"})
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_login_empty_password_returns_422() -> None:
    """빈 비밀번호는 서비스에 닿기 전에 스키마가 거른다."""
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post("/api/operator/login", json={"password": ""})
        assert res.status_code == 422
    finally:
        await gen.aclose()
