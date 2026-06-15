"""카드 이미지 생성 오케스트레이션.

페르소나 카드에 필요한 두 그림(인물 IMG-01, 배경 IMG-02)을 병렬로 생성한다.
두 장이 모두 있어야 카드를 만들 수 있으므로, 하나라도 실패하면 전체 실패로 본다.
프롬프트는 입력으로 받는다(상류 AI-05는 이 모듈 책임 밖).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from app.adapters.ai_client import AIPurpose
from app.core.errors import ExternalServiceError

# target → 생성 사이즈. 카드 의도에 맞는 비율을 고정.
PORTRAIT_SIZE = "1024x1536"  # 증명사진 비율 (2:3)
BACKGROUND_SIZE = "1536x1024"  # 카드 배경 비율 (3:2)


class _ImageGenerator(Protocol):
    async def generate_image(
        self, purpose: AIPurpose, prompt: str, *, size: str | None = ..., n: int = ...
    ) -> bytes: ...


@dataclass(frozen=True)
class CardImages:
    portrait: bytes
    background: bytes


async def generate_card_images(
    ai: _ImageGenerator,
    *,
    portrait_prompt: str,
    background_prompt: str,
) -> CardImages:
    """인물·배경 그림을 병렬 생성. 둘 다 성공해야 CardImages 반환."""
    results = await asyncio.gather(
        ai.generate_image(AIPurpose.PORTRAIT_IMAGE, portrait_prompt, size=PORTRAIT_SIZE),
        ai.generate_image(AIPurpose.WORLD_IMAGE, background_prompt, size=BACKGROUND_SIZE),
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
    return CardImages(portrait=portrait_result, background=background_result)
