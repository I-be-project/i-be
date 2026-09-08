"""/api/dev 노출 가드 — 인증이 없고 AI 크레딧을 쓰므로 로컬에서만 등록되어야 한다."""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest

from app.config import get_settings
from app.main import create_app

_PRODUCTION_ENV = {
    "APP_ENV": "production",
    "JWT_SECRET": "b7f3d1c9a2e84f60b5d7c3a1e9f2b8d4",
    "JWT_CARD_SHARE_SECRET": "3a9e1f7c5b2d8046a1c7e3f9b5d2a806",
    "ADMIN_PASSWORD": "a-real-admin-password",
    "OPERATOR_PASSWORD": "a-real-operator-password",
    "FRONTEND_ORIGIN": "https://i-be.vercel.app",
}


@pytest.fixture
def reset_settings() -> Iterator[None]:
    """get_settings는 lru_cache라 환경변수 변경 전후로 캐시를 비워야 한다."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _dev_paths(app: object) -> list[str]:
    return [r.path for r in app.routes if r.path.startswith("/api/dev")]  # type: ignore[attr-defined]


async def _get(app: object, url: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(url)


def test_dev_router_is_registered_in_local(reset_settings: None) -> None:
    """기본(APP_ENV=local)에서는 개발용 엔드포인트가 살아 있다."""
    assert _dev_paths(create_app())


def test_dev_router_is_absent_in_production(
    monkeypatch: pytest.MonkeyPatch, reset_settings: None
) -> None:
    for name, value in _PRODUCTION_ENV.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()

    assert _dev_paths(create_app()) == []


async def test_dev_endpoint_returns_404_in_production(
    monkeypatch: pytest.MonkeyPatch, reset_settings: None
) -> None:
    """라우트가 빠졌으니 외부에서 호출해도 AI를 태우지 못하고 404로 끝난다."""
    for name, value in _PRODUCTION_ENV.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()

    res = await _get(create_app(), "/api/dev/prompts")

    assert res.status_code == 404


async def test_healthz_still_works_in_production(
    monkeypatch: pytest.MonkeyPatch, reset_settings: None
) -> None:
    """가드가 운영 라우팅 전반을 망가뜨리지 않는지 확인(배포 헬스체크 경로)."""
    for name, value in _PRODUCTION_ENV.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()

    res = await _get(create_app(), "/healthz")

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
