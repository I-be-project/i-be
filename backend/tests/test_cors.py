"""CORS 설정 테스트 — 기본 전체 개방, CORS_ALLOW_ORIGINS로 좁히기."""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest

from app.config import get_settings

EXTERNAL_ORIGIN = "https://external.example.com"


@pytest.fixture
def reset_settings() -> Iterator[None]:
    """get_settings는 lru_cache라 환경변수 변경 전후로 캐시를 비워야 한다."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _app() -> object:
    from app.main import create_app

    return create_app()


async def _request(app: object, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(**kwargs)  # type: ignore[arg-type]


async def test_simple_request_from_any_origin_is_allowed() -> None:
    """기본 설정(*)에서 임의 오리진의 GET에 CORS 헤더가 붙는다."""
    res = await _request(_app(), method="GET", url="/healthz", headers={"Origin": EXTERNAL_ORIGIN})

    assert res.status_code == 200
    # "*" + allow_credentials 조합에서는 와일드카드 대신 요청 Origin을 그대로 되돌려준다.
    assert res.headers["access-control-allow-origin"] == EXTERNAL_ORIGIN
    assert res.headers["access-control-allow-credentials"] == "true"


async def test_preflight_from_any_origin_allows_auth_header() -> None:
    """관리자 API 호출 전 브라우저가 보내는 preflight가 통과한다."""
    res = await _request(
        _app(),
        method="OPTIONS",
        url="/api/admin/students",
        headers={
            "Origin": EXTERNAL_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert res.status_code == 200, res.text
    assert res.headers["access-control-allow-origin"] == EXTERNAL_ORIGIN
    assert "authorization" in res.headers["access-control-allow-headers"].lower()


async def test_allow_origins_can_be_narrowed(
    monkeypatch: pytest.MonkeyPatch, reset_settings: None
) -> None:
    """CORS_ALLOW_ORIGINS를 지정하면 목록 밖 오리진에는 헤더를 주지 않는다."""
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", f"https://allowed.example.com, {EXTERNAL_ORIGIN}")
    get_settings.cache_clear()
    app = _app()

    allowed = await _request(
        app, method="GET", url="/healthz", headers={"Origin": "https://allowed.example.com"}
    )
    blocked = await _request(
        app, method="GET", url="/healthz", headers={"Origin": "https://evil.example.com"}
    )

    assert allowed.headers["access-control-allow-origin"] == "https://allowed.example.com"
    # 미들웨어는 요청 자체를 막지 않고 CORS 헤더만 생략한다(차단 주체는 브라우저).
    assert "access-control-allow-origin" not in blocked.headers


def test_empty_setting_falls_back_to_open(
    monkeypatch: pytest.MonkeyPatch, reset_settings: None
) -> None:
    """빈 값·공백만 들어와도 오리진 목록이 비지 않는다."""
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "  ,  ")
    get_settings.cache_clear()

    assert get_settings().cors_origin_list == ["*"]
