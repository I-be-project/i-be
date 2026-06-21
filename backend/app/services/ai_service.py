"""AI 호출 비즈니스 래퍼.

- Adapter(AIClient)는 단순 호출, Service는 응답 검증·후처리·재시도 정책 적용.
- generate_image_prompts (AI-05): persona → 영문 이미지 프롬프트 2개.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

from app.adapters.ai_client import AIPurpose
from app.core.logging import get_logger
from app.core.prompts.image_prompt import build_messages, fallback_prompts
from app.schemas.persona import ImagePrompts, Persona

logger = get_logger(__name__)

_BANNED = ("nsfw", "explicit", "gore")


class AIService:
    async def analyze_responses(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_adaptive_questions(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_final_question(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def create_persona(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_image_prompts(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_images(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError


class _ChatClient(Protocol):
    async def chat(
        self, purpose: AIPurpose, messages: list[dict[str, Any]], **kwargs: Any
    ) -> Any: ...


def _parse(content: str | None) -> ImagePrompts | None:
    """chat 응답 본문 → 검증된 ImagePrompts. 실패하면 None."""
    if not content:
        return None
    try:
        data = json.loads(content)
        prompts = ImagePrompts(
            portrait_prompt=str(data["portrait_prompt"]).strip(),
            background_prompt=str(data["background_prompt"]).strip(),
        )
    except (ValueError, KeyError, TypeError):
        return None
    blob = f"{prompts.portrait_prompt} {prompts.background_prompt}".lower()
    if any(bad in blob for bad in _BANNED):
        return None
    return prompts


async def generate_image_prompts(ai: _ChatClient, persona: Persona) -> ImagePrompts:
    """AI-05. persona → 이미지 프롬프트 2개. 최대 2회 시도 후 폴백."""
    messages = build_messages(persona)
    for attempt in range(2):
        resp = await ai.chat(
            AIPurpose.IMAGE_PROMPT, messages, response_format={"type": "json_object"}
        )
        # 비정상 응답(빈 choices·None 메시지)도 폴백으로 흡수 — 파이프라인을 멈추지 않는다.
        content = resp.choices[0].message.content if resp.choices else None
        prompts = _parse(content)
        if prompts is not None:
            return prompts
        logger.warning("image_prompt.invalid", attempt=attempt + 1)
    logger.warning("image_prompt.fallback", persona=persona.name)
    return fallback_prompts(persona)
