"""OpenAI 호환 클라이언트 (OpenRouter 또는 OpenAI 직접).

- purpose 기반 모델 매핑 (코드는 모델명을 직접 모름)
- 이미지 호출 동시성 세마포어
- 재시도/타임아웃은 추후 구현
"""

from __future__ import annotations

import asyncio
from enum import StrEnum
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings


class AIPurpose(StrEnum):
    ANALYZE = "analyze"
    ADAPTIVE_QUESTIONS = "adaptive_questions"
    FINAL_QUESTION = "final_question"
    PERSONA = "persona"
    IMAGE_PROMPT = "image_prompt"
    PORTRAIT_IMAGE = "portrait_image"
    WORLD_IMAGE = "world_image"


class AIClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model_map: dict[AIPurpose, str],
        image_concurrency: int = 10,
    ) -> None:
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        self._models = model_map
        self._image_sem = asyncio.Semaphore(image_concurrency)

    @classmethod
    def from_settings(cls, settings: Settings) -> AIClient:
        return cls(
            base_url=settings.ai_provider_base_url,
            api_key=settings.ai_api_key,
            model_map={
                AIPurpose.ANALYZE: settings.ai_model_analyze,
                AIPurpose.ADAPTIVE_QUESTIONS: settings.ai_model_adaptive_questions,
                AIPurpose.FINAL_QUESTION: settings.ai_model_final_question,
                AIPurpose.PERSONA: settings.ai_model_persona,
                AIPurpose.IMAGE_PROMPT: settings.ai_model_image_prompt,
                AIPurpose.PORTRAIT_IMAGE: settings.ai_model_portrait_image,
                AIPurpose.WORLD_IMAGE: settings.ai_model_world_image,
            },
            image_concurrency=settings.image_concurrency,
        )

    async def chat(
        self,
        purpose: AIPurpose,
        messages: list[dict[str, Any]],
        **kwargs: Any,
    ) -> Any:
        return await self._client.chat.completions.create(
            model=self._models[purpose],
            messages=messages,
            **kwargs,
        )

    async def generate_image(
        self,
        purpose: AIPurpose,
        prompt: str,
        **kwargs: Any,
    ) -> Any:
        async with self._image_sem:
            return await self._client.images.generate(
                model=self._models[purpose],
                prompt=prompt,
                **kwargs,
            )
