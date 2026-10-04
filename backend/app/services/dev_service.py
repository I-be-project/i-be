"""dev 화면용 — 저장된 설문 답변을 페르소나 프롬프트 입력으로 옮긴다.

generated.answers의 stage별 payload는 프론트가 저장한 그대로의 자유 dict다
(형태는 frontend/lib/answerSync.ts buildStagePayloads 참조).
여기서는 그 dict를 페르소나 user 프롬프트(persona_prompt.build_user_prompt)의 슬롯으로 옮기기만 한다.

DB만 읽고 AI를 호출하지 않으므로 순수 함수로 두고 단위 테스트한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.career_pools import CAREER_POOLS
from app.core.survey_catalog import Q1TO6


@dataclass(frozen=True, slots=True)
class PersonaPromptInputs:
    """persona_prompt.build_user_prompt의 슬롯."""

    riasec_scores: dict[str, int] = field(default_factory=dict)
    pair_code: str = ""
    career_pool: list[str] = field(default_factory=list)
    q7a_first: str | None = None
    q7a_second: str | None = None
    q7b_first: str | None = None
    q7b_second: str | None = None
    q8_response: str | None = None
    q9_response: str | None = None
    # Q1~Q6 "질문 → 고른 선택지" 문구. v40은 점수가 아니라 반복 행동 흐름을 읽는다.
    q1to6_texts: list[str] = field(default_factory=list)


def _text(value: Any) -> str | None:
    """문자열 값을 정리해 돌려준다. 빈 값·비문자열은 None."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def chip_items(payload: dict[str, Any]) -> list[str]:
    """Q8·Q9 payload({chips: [...], freeText}) → 고른 칩 + 자유서술 목록."""
    chips = payload.get("chips")
    parts = (
        [c.strip() for c in chips if isinstance(c, str) and c.strip()]
        if isinstance(chips, list)
        else []
    )
    free = _text(payload.get("freeText"))
    if free:
        parts.append(free)
    return parts


def _chip_answer(payload: dict[str, Any]) -> str | None:
    """Q8·Q9 payload → 한 줄 문자열.

    칩과 자유서술을 모두 살린다 — 둘 다 해석 근거다.
    """
    return " / ".join(chip_items(payload)) or None


def _subfield_title(value: Any) -> str | None:
    """Q7-B payload의 first/second({subfield_id, title}) → 제목."""
    if not isinstance(value, dict):
        return None
    return _text(value.get("title"))


def q1to6_texts(q1to6: dict[str, Any]) -> list[str]:
    """Q1~Q6 payload({answers: [{questionId, value}]}) → "Q1 [장면] 질문 → 선택지" 목록.

    카탈로그에 없는 ID는 원문 그대로 둔다.
    """
    raw = q1to6.get("answers")
    picked = {
        a.get("questionId"): a.get("value")
        for a in (raw if isinstance(raw, list) else [])
        if isinstance(a, dict)
    }
    return [
        f"Q{qid} {question} → {options.get(value, value)}"
        for qid, (question, options) in Q1TO6.items()
        if isinstance(value := picked.get(qid), str)
    ]


def build_persona_inputs(
    answers: dict[str, dict[str, Any]], *, career_pool: list[str]
) -> PersonaPromptInputs:
    """stage → payload 맵을 프롬프트 슬롯으로 변환.

    career_pool을 주면 그대로 쓰고, 비어 있으면 Pair Code의 기본 풀(CAREER_POOLS)로 채운다.
    누락된 stage는 조용히 비운다 — 진행 중 세션도 그대로 미리보기할 수 있어야 한다.
    """
    q1to6 = answers.get("q1to6", {})
    q7a = answers.get("q7a", {})
    q7b = answers.get("q7b", {})
    q8 = answers.get("q8", {})
    q9 = answers.get("q9", {})

    riasec = q1to6.get("riasec")
    scores = (
        {k: int(v) for k, v in riasec.items() if isinstance(v, (int, float))}
        if isinstance(riasec, dict)
        else {}
    )

    pair_code = _text(q1to6.get("pairCode")) or ""

    return PersonaPromptInputs(
        riasec_scores=scores,
        pair_code=pair_code,
        career_pool=[c for c in career_pool if c.strip()] or CAREER_POOLS.get(pair_code, []),
        q7a_first=_text(q7a.get("first")),
        q7a_second=_text(q7a.get("second")),
        q7b_first=_subfield_title(q7b.get("first")),
        q7b_second=_subfield_title(q7b.get("second")),
        q8_response=_chip_answer(q8),
        q9_response=_chip_answer(q9),
        q1to6_texts=q1to6_texts(q1to6),
    )
