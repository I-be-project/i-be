"""페르소나 → 카드 PNG 오케스트레이터.

흐름: AI-05 프롬프트 → 인물(얼굴 있으면 edit, 없으면 generate) ‖ 배경(generate)
     → render_card. 인물·배경 둘 다 성공해야 카드 발급.
저장(DB/Storage)은 이 모듈 책임 밖 — bytes만 반환한다.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError
from app.schemas.persona import ImagePrompts, Persona
from app.services.ai_service import generate_image_prompts
from app.services.card_image_service import BACKGROUND_SIZE, PORTRAIT_SIZE
from app.services.card_renderer import PersonaCardContent, render_card


@dataclass(frozen=True)
class CardResult:
    card_png: bytes
    prompts: ImagePrompts


async def _portrait(ai: AIClient, prompt: str, photo: bytes | None) -> bytes:
    if photo is not None:
        return await ai.edit_image(AIPurpose.PORTRAIT_IMAGE, prompt, photo, size=PORTRAIT_SIZE)
    return await ai.generate_image(AIPurpose.PORTRAIT_IMAGE, prompt, size=PORTRAIT_SIZE)


async def generate_card(
    ai: AIClient,
    persona: Persona,
    *,
    photo: bytes | None,
    qr_data: str,
) -> CardResult:
    prompts = await generate_image_prompts(ai, persona)

    results = await asyncio.gather(
        _portrait(ai, prompts.portrait_prompt, photo),
        ai.generate_image(AIPurpose.WORLD_IMAGE, prompts.background_prompt, size=BACKGROUND_SIZE),
        return_exceptions=True,
    )
    portrait_result, background_result = results

    failures: dict[str, str] = {}
    if isinstance(portrait_result, BaseException):
        failures["portrait"] = str(portrait_result)
    if isinstance(background_result, BaseException):
        failures["background"] = str(background_result)
    if failures:
        raise ExternalServiceError(
            "카드 이미지 생성에 실패했습니다.",
            details={"failed": list(failures), "reasons": failures},
        )

    assert isinstance(portrait_result, bytes)
    assert isinstance(background_result, bytes)

    content = PersonaCardContent(
        title=persona.name, tagline=persona.tagline, keywords=persona.keywords
    )
    card_png = await run_in_threadpool(
        render_card, background_result, portrait_result, content, qr_data
    )
    return CardResult(card_png=card_png, prompts=prompts)
