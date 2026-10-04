"""페르소나 생성 프롬프트 (Career Persona Prompt v40 + Career Direction Pool v4).

- DEFAULT_SYSTEM_PROMPT: persona_prompt_v40.md 원문 + Pool 사용 원칙. dev 화면 편집 기본값.
- build_user_prompt: 학생의 실제 답변과 Pair별 Pool 항목을 채운다.
- PERSONA_OUTPUT_SCHEMA: v40 27장 출력 계약. codex의 --output-schema로 형태를 강제한다.

프롬프트 문구를 고칠 땐 md만 바꾼다. question_prompt.py(Q7-B/Q8/Q9 생성)와 달리
여기는 "설문이 끝난 뒤" 한 번 도는 프롬프트다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.career_pools import POOL_GUIDE
from app.core.competencies import COMPETENCY_LABELS

DEFAULT_SYSTEM_PROMPT = (
    Path(__file__).with_name("persona_prompt_v40.md").read_text(encoding="utf-8").strip()
    + "\n\n---\n\n# 부록 — Career Direction Pool 사용 원칙\n\n"
    + POOL_GUIDE
)


# v40 27장 출력 계약. codex --output-schema에 그대로 넘긴다.
_TEXT_FIELDS = (
    "career_name",
    "persona_name",
    "persona_anchor",
    "target",
    "desired_impact",
    "value_attitude",
    "problem_solving",
    "career_reason",
    "short_description",
)
PERSONA_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        **{f: {"type": "string"} for f in _TEXT_FIELDS},
        "career_required_competencies": {
            "type": "array",
            "items": {"type": "string", "enum": list(COMPETENCY_LABELS.values())},
            "minItems": 3,
            "maxItems": 3,
        },
    },
    "required": [*_TEXT_FIELDS, "career_required_competencies"],
    "additionalProperties": False,
}


def _or_none(value: str | None) -> str:
    """빈 값을 프롬프트에서 '(없음)'으로 드러낸다 — 모델이 지어내지 않게."""
    return value if value else "(없음)"


def build_user_prompt(
    *,
    riasec_scores: dict[str, int],
    pair_code: str,
    career_pool: list[str],
    q7a_first: str | None,
    q7a_second: str | None,
    q7b_first: str | None,
    q7b_second: str | None,
    q8_response: str | None,
    q9_response: str | None,
    q1to6_texts: list[str],
) -> str:
    """학생 답변과 Pair별 Career Direction Pool 항목을 채운다."""
    pool = "\n".join(f"- {c}" for c in career_pool) if career_pool else "(없음)"
    q1to6 = "\n".join(f"- {t}" for t in q1to6_texts) if q1to6_texts else "(없음)"
    return f"""다음은 한 학생의 오늘 진로 탐험 기록이다.

[Q1~Q6 — 팀 안에서 고른 행동]
{q1to6}

[RIASEC]
- scores: {json.dumps(riasec_scores, ensure_ascii=False)}
- pair_code: {_or_none(pair_code)}

[Career Direction Pool — {_or_none(pair_code)}]
{pool}

[Q7-A — 다시 가보고 싶은 공간]
- 1순위: {_or_none(q7a_first)}
- 2순위: {_or_none(q7a_second)}

[Q7-B — 그 공간에서 써 보고 싶은 도구]
- 1순위: {_or_none(q7b_first)}
- 2순위: {_or_none(q7b_second)}

[Q8 — 어떻게 해보고 싶은가]
{_or_none(q8_response)}

[Q9 — 무엇·누구를 더 살펴보고 싶은가]
{_or_none(q9_response)}

위 기록을 「28. 생성 순서」대로 해석해 Career Persona 하나를 생성하라.
Career Direction Pool은 정답표가 아니라 참고 사전이다.
내부 판단 과정은 출력하지 말고 「27. 출력」의 JSON 형식만 반환한다."""
