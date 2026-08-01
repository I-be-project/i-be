"""/api/generate/{stage} 라우터 통합 테스트.

AIClient를 stub으로 교체해 실제 AI 호출 없이 검증한다.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import httpx
import pytest

from app.deps import current_student, get_ai_client
from app.main import create_app

# ──────────────────────────────────────────────────────────────
# Fixtures & helpers
# ──────────────────────────────────────────────────────────────

_BASE_BODY: dict[str, Any] = {
    "riasecScores": {"A": 6, "C": 4},
    "pairCode": "AC",
    "q1to6": ["q1-a", "q3-c"],
    "q7aFirst": "감각을 활용하는 구역",
    "q7aSecond": "정보를 분석하는 구역",
}


class _StubAI:
    """chat()만 구현한 AI stub. stage 키를 포함한 JSON을 반환한다."""

    def __init__(self, stage: str, payload: dict[str, Any]) -> None:
        self._content = json.dumps({stage: payload})

    async def chat(self, purpose: Any, messages: Any, **kwargs: Any) -> Any:
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._content))]
        )


class _StubAIBadKey:
    """최상위 키가 stage와 다른 응답을 돌려주는 stub."""

    async def chat(self, purpose: Any, messages: Any, **kwargs: Any) -> Any:
        content = json.dumps({"wrong_key": {}})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _build_app(stub_ai: Any) -> Any:
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: stub_ai
    # generate는 인증이 필요하다(AI 남용 방지). 로직 검증 테스트에서는 인증을 통과시킨다.
    app.dependency_overrides[current_student] = lambda: uuid4()
    return app


async def _client(app: Any) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ──────────────────────────────────────────────────────────────
# Tests: valid stages
# ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "stage,extra_body",
    [
        ("q7b", {}),
        ("q8", {"q7bFirst": {"subfield_id": "SUB_01"}, "q7bSecond": None}),
        (
            "q9",
            {
                "q7bFirst": {"subfield_id": "SUB_01"},
                "q7bSecond": None,
                "q8": {"chip_id": "ATT_01"},
            },
        ),
    ],
)
async def test_valid_stage_returns_stub_payload(stage: str, extra_body: dict[str, Any]) -> None:
    """유효한 stage에 대해 AI stub의 JSON을 그대로 반환한다."""
    stub_payload = {"title": f"{stage} 제목", "options": []}
    app = _build_app(_StubAI(stage, stub_payload))
    gen = _client(app)
    client = await anext(gen)
    try:
        body = {**_BASE_BODY, **extra_body}
        res = await client.post(f"/api/generate/{stage}", json=body)
        assert res.status_code == 200, res.text
        data = res.json()
        assert stage in data, f"응답에 '{stage}' 키 없음: {data}"
        assert data[stage] == stub_payload
    finally:
        await gen.aclose()


# ──────────────────────────────────────────────────────────────
# Tests: unknown stage → 404
# ──────────────────────────────────────────────────────────────


async def test_unknown_stage_returns_404() -> None:
    """등록되지 않은 stage → 404 not_found."""
    app = _build_app(_StubAI("q7b", {}))
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/generate/q999", json=_BASE_BODY)
        assert res.status_code == 404, res.text
        assert res.json()["error"]["code"] == "not_found"
    finally:
        await gen.aclose()


# ──────────────────────────────────────────────────────────────
# Tests: AI returns wrong top-level key → 502
# ──────────────────────────────────────────────────────────────


async def test_ai_missing_stage_key_returns_502() -> None:
    """AI 응답에 stage 키가 없을 때 ExternalServiceError(502) 반환."""
    app = _build_app(_StubAIBadKey())
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/generate/q7b", json=_BASE_BODY)
        assert res.status_code == 502, res.text
        assert res.json()["error"]["code"] == "external_service_error"
    finally:
        await gen.aclose()


# ──────────────────────────────────────────────────────────────
# Tests: 인증 필요 — 토큰 없으면 401
# ──────────────────────────────────────────────────────────────


async def test_generate_requires_auth() -> None:
    """토큰(Authorization) 없이 호출하면 401 — AI(유료) 남용 방지."""
    # current_student를 override하지 않아 실제 인증 의존성이 동작한다.
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: _StubAI("q7b", {})
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/generate/q7b", json=_BASE_BODY)
        assert res.status_code == 401, res.text
        assert res.json()["error"]["code"] == "unauthorized"
    finally:
        await gen.aclose()
