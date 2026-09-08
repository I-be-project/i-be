"""dev 페르소나 생성 — 답변 매핑과 라우터.

codex는 서브프로세스라 stub으로 교체해 실제 실행 없이 검증한다.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import httpx
import pytest

from app.core.errors import ExternalServiceError
from app.deps import get_codex_client, get_session_repo
from app.main import create_app
from app.services.dev_service import build_persona_inputs

# frontend/lib/answerSync.ts buildStagePayloads가 저장하는 실제 형태.
_ANSWERS: dict[str, dict[str, Any]] = {
    "q1to6": {
        "answers": [{"questionId": 1, "value": "q1-i"}],
        "optionIds": ["q1-i"],
        "riasec": {"R": 2, "I": 7, "A": 4, "S": 1, "E": 0, "C": 3},
        "pairCode": "IA",
    },
    "q7a": {"first": "정보를 분석하는 구역", "second": "감각을 활용하는 구역"},
    "q7b": {
        "first": {"subfield_id": "sf-1", "title": "사용자 경험 설계"},
        "second": {"subfield_id": "sf-2", "title": "데이터 시각화"},
    },
    "q8": {"chips": ["작은 차이를 비교하는", "차근차근 맞춰 보는"], "freeText": "직접 써보고 싶어"},
    "q9": {"chips": ["처음 쓰는 사람의 편안함"], "freeText": ""},
}


# ──────────────────────────────────────────────────────────────
# build_persona_inputs — 저장 payload → 프롬프트 슬롯
# ──────────────────────────────────────────────────────────────


def test_maps_every_stage_into_prompt_slots() -> None:
    inputs = build_persona_inputs(_ANSWERS, career_pool=["UX 디자이너", "서비스 기획자"])

    assert inputs.pair_code == "IA"
    assert inputs.riasec_scores["I"] == 7
    assert inputs.career_pool == ["UX 디자이너", "서비스 기획자"]
    assert inputs.q7a_first == "정보를 분석하는 구역"
    assert inputs.q7b_first == "사용자 경험 설계"
    # 칩과 자유서술은 둘 다 근거라 함께 살린다.
    assert inputs.q8_response == "작은 차이를 비교하는 / 차근차근 맞춰 보는 / 직접 써보고 싶어"
    # freeText가 비면 칩만 남는다.
    assert inputs.q9_response == "처음 쓰는 사람의 편안함"


def test_missing_stages_do_not_raise() -> None:
    """진행 중 세션(q8·q9 없음)도 그대로 미리보기할 수 있어야 한다."""
    inputs = build_persona_inputs({"q1to6": _ANSWERS["q1to6"]}, career_pool=[])

    assert inputs.pair_code == "IA"
    assert inputs.q7a_first is None
    assert inputs.q8_response is None
    assert inputs.career_pool == []


def test_ignores_malformed_payload_values() -> None:
    """프론트가 형태를 바꿔도 500이 아니라 빈 슬롯으로 수렴해야 한다."""
    inputs = build_persona_inputs(
        {
            "q1to6": {"riasec": "not-a-dict", "pairCode": 42},
            "q7b": {"first": "문자열이 아니라 dict여야 함"},
            "q8": {"chips": [None, "  ", "쓸 만한 칩"], "freeText": None},
        },
        career_pool=["", "  ", "UX 디자이너"],
    )

    assert inputs.riasec_scores == {}
    assert inputs.pair_code == ""
    assert inputs.q7b_first is None
    assert inputs.q8_response == "쓸 만한 칩"
    assert inputs.career_pool == ["UX 디자이너"]


# ──────────────────────────────────────────────────────────────
# 라우터 — codex stub
# ──────────────────────────────────────────────────────────────

_CODEX_RESULT: dict[str, Any] = {
    "persona_name": "처음 쓰는 사람의 불편을 발견하는 UX 디자이너",
    "base_career": "UX 디자이너",
    "short_description": "처음 사용하는 사람이 멈추는 지점을 관찰하고 화면 흐름을 다시 설계해요.",
    "source_career_pool": True,
    "pool_extended": False,
    "q8_reflection": "작은 차이를 비교하는 방식",
    "q9_reflection": "처음 쓰는 사람",
}


class _StubSessions:
    """최근 세션 1개와 그 답변만 돌려주는 SessionRepository stub."""

    def __init__(self, *, has_session: bool = True) -> None:
        self._has_session = has_session
        self.id = uuid4()

    async def get_latest_for_student(self, student_id: Any) -> Any:
        if not self._has_session:
            return None
        return type("S", (), {"id": self.id, "status": "completed"})()

    async def list_answers(self, session_id: Any) -> list[Any]:
        return [
            type("A", (), {"stage": stage, "payload": payload})()
            for stage, payload in _ANSWERS.items()
        ]


class _StubCodex:
    """generate_json만 쓰는 CodexClient stub. 보낸 프롬프트를 기록한다."""

    def __init__(
        self, result: dict[str, Any] | None = None, error: Exception | None = None
    ) -> None:
        self._result = result or _CODEX_RESULT
        self._error = error
        self.prompt: str | None = None

    async def generate_json(self, prompt: str, schema: Any, *, model: Any = None) -> dict[str, Any]:
        self.prompt = prompt
        if self._error is not None:
            raise self._error
        return self._result


def _build_app(sessions: Any, codex: Any) -> Any:
    app = create_app()
    app.dependency_overrides[get_session_repo] = lambda: sessions
    app.dependency_overrides[get_codex_client] = lambda: codex
    return app


async def _post(app: Any, url: str, body: dict[str, Any]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(url, json=body)


def _body(**over: Any) -> dict[str, Any]:
    return {
        "student_id": str(uuid4()),
        "system_prompt": "너는 진로 콘텐츠 작성자다.",
        "career_pool": ["UX 디자이너"],
        **over,
    }


async def test_persona_returns_v1_output_contract() -> None:
    codex = _StubCodex()
    res = await _post(_build_app(_StubSessions(), codex), "/api/dev/persona", _body())

    assert res.status_code == 200
    data = res.json()
    assert data["base_career"] == "UX 디자이너"
    assert data["source_career_pool"] is True
    assert data["elapsed_seconds"] >= 0


async def test_persona_prompt_carries_edited_system_prompt_and_answers() -> None:
    """화면에서 고친 시스템 프롬프트와 DB 답변이 실제로 codex까지 가야 한다."""
    codex = _StubCodex()
    await _post(
        _build_app(_StubSessions(), codex),
        "/api/dev/persona",
        _body(system_prompt="편집된 시스템 프롬프트다."),
    )

    assert codex.prompt is not None
    assert "편집된 시스템 프롬프트다." in codex.prompt
    assert "pair_code: IA" in codex.prompt
    assert "처음 쓰는 사람의 편안함" in codex.prompt
    assert "- UX 디자이너" in codex.prompt


async def test_persona_404_when_student_has_no_session() -> None:
    res = await _post(
        _build_app(_StubSessions(has_session=False), _StubCodex()), "/api/dev/persona", _body()
    )

    assert res.status_code == 404


async def test_persona_surfaces_codex_failure() -> None:
    """codex 실패가 200 빈 응답으로 삼켜지면 안 된다."""
    codex = _StubCodex(error=ExternalServiceError("codex 실행이 실패했습니다."))
    res = await _post(_build_app(_StubSessions(), codex), "/api/dev/persona", _body())

    assert res.status_code >= 500


@pytest.mark.parametrize("bad", [{"system_prompt": ""}, {"career_pool": ["x"] * 21}])
async def test_persona_rejects_invalid_input(bad: dict[str, Any]) -> None:
    res = await _post(_build_app(_StubSessions(), _StubCodex()), "/api/dev/persona", _body(**bad))

    assert res.status_code == 422
