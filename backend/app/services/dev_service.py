"""dev 화면용 — 저장된 설문 답변을 페르소나 프롬프트 입력으로 옮긴다.

generated.answers의 stage별 payload는 프론트가 저장한 그대로의 자유 dict다
(형태는 frontend/lib/answerSync.ts buildStagePayloads 참조).
여기서는 그 dict를 「Persona 생성 규칙 v1」 12장 템플릿의 슬롯으로 옮기기만 한다.

DB만 읽고 AI를 호출하지 않으므로 순수 함수로 두고 단위 테스트한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class PersonaPromptInputs:
    """12장 User Prompt Template v1의 슬롯."""

    riasec_scores: dict[str, int] = field(default_factory=dict)
    pair_code: str = ""
    career_pool: list[str] = field(default_factory=list)
    q7a_first: str | None = None
    q7a_second: str | None = None
    q7b_first: str | None = None
    q7b_second: str | None = None
    q8_response: str | None = None
    q9_response: str | None = None
    # Q1~Q6 원문은 백엔드에 없다 — DB엔 optionId(q1-s 등)만 있고 라벨 카탈로그는
    # 프론트(lib/mock/questions.ts)에만 있다. 게다가 그 ID가 담은 정보(RIASEC 유형)는
    # 이미 riasec_scores에 집계돼 있어 그대로 넣으면 노이즈만 된다. 규칙 v1에서도
    # Q1~Q6 원문은 우선순위 6위(선택)라 비워 둔다.
    q1to6_texts: list[str] = field(default_factory=list)


def _text(value: Any) -> str | None:
    """문자열 값을 정리해 돌려준다. 빈 값·비문자열은 None."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _chip_answer(payload: dict[str, Any]) -> str | None:
    """Q8·Q9 payload({chips: [...], freeText}) → 한 줄 문자열.

    칩과 자유서술을 모두 살린다 — 규칙 v1이 둘 다 근거로 쓰기 때문.
    """
    chips = payload.get("chips")
    parts = (
        [c.strip() for c in chips if isinstance(c, str) and c.strip()]
        if isinstance(chips, list)
        else []
    )
    free = _text(payload.get("freeText"))
    if free:
        parts.append(free)
    return " / ".join(parts) or None


def _subfield_title(value: Any) -> str | None:
    """Q7-B payload의 first/second({subfield_id, title}) → 제목."""
    if not isinstance(value, dict):
        return None
    return _text(value.get("title"))


def build_persona_inputs(
    answers: dict[str, dict[str, Any]], *, career_pool: list[str]
) -> PersonaPromptInputs:
    """stage → payload 맵을 프롬프트 슬롯으로 변환.

    career_pool은 DB에 저장되지 않으므로(프론트 Q7-B 응답에만 존재) 호출 측에서 받는다.
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

    return PersonaPromptInputs(
        riasec_scores=scores,
        pair_code=_text(q1to6.get("pairCode")) or "",
        career_pool=[c for c in career_pool if c.strip()],
        q7a_first=_text(q7a.get("first")),
        q7a_second=_text(q7a.get("second")),
        q7b_first=_subfield_title(q7b.get("first")),
        q7b_second=_subfield_title(q7b.get("second")),
        q8_response=_chip_answer(q8),
        q9_response=_chip_answer(q9),
    )
