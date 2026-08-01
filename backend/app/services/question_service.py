"""Q7-B/Q8/Q9 생성 서비스 (stateless)."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError, NotFoundError
from app.core.prompts.question_prompt import (
    build_q7b_messages,
    build_q8_messages,
    build_q9_messages,
)
from app.schemas.questions import VALID_STAGES, GenerateInput

_MessageBuilder = Callable[[GenerateInput], list[dict[str, Any]]]

# stage → (AIPurpose, message builder)
_STAGE_CONFIG: dict[str, tuple[AIPurpose, _MessageBuilder]] = {
    "q7b": (AIPurpose.ADAPTIVE_QUESTIONS, build_q7b_messages),
    "q8": (AIPurpose.ADAPTIVE_QUESTIONS, build_q8_messages),
    "q9": (AIPurpose.ADAPTIVE_QUESTIONS, build_q9_messages),
}


async def generate_stage(ai: AIClient, stage: str, data: GenerateInput) -> dict[str, Any]:
    """주어진 stage에 맞는 프롬프트를 빌드하고 AI를 호출해 결과 dict를 반환한다.

    - 알 수 없는 stage → NotFoundError (404)
    - AI 응답 최상위 키가 stage와 다름 → ExternalServiceError (502)
    """
    if stage not in VALID_STAGES:
        raise NotFoundError(f"알 수 없는 stage입니다: {stage!r}")

    purpose, builder = _STAGE_CONFIG[stage]
    messages = builder(data)

    resp = await ai.chat(purpose, messages, response_format={"type": "json_object"})
    raw: str = resp.choices[0].message.content

    try:
        parsed: dict[str, Any] = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ExternalServiceError(
            "AI 응답을 JSON으로 파싱하지 못했습니다.",
            details={"stage": stage, "raw": raw[:300]},
        ) from exc

    if stage not in parsed:
        raise ExternalServiceError(
            f"AI 응답에 '{stage}' 키가 없습니다.",
            details={"stage": stage, "keys": list(parsed.keys())},
        )

    return parsed
