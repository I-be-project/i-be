"""AI 클라이언트.

- Chat: OpenAI 호환 SDK (OpenRouter 또는 OpenAI 직접). purpose → model 매핑.
- Image: 커스텀 엔드포인트 (Mindlogic 등) 지원을 위해 httpx 직접 호출.
        응답은 base64 (b64_json) → bytes 디코드 후 반환.

재시도/백오프는 Service 레이어 또는 추후 어댑터 데코레이터로 추가 예정.
"""

from __future__ import annotations

import asyncio
import base64
from enum import StrEnum
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.config import Settings
from app.core.errors import ExternalServiceError


class AIPurpose(StrEnum):
    # Chat 계열
    ANALYZE = "analyze"
    ADAPTIVE_QUESTIONS = "adaptive_questions"
    FINAL_QUESTION = "final_question"
    PERSONA = "persona"
    IMAGE_PROMPT = "image_prompt"
    # Image 계열 — 현재 모델은 모두 동일, 향후 분기 가능하게 라벨만 분리
    PORTRAIT_IMAGE = "portrait_image"
    WORLD_IMAGE = "world_image"


class AIClient:
    def __init__(
        self,
        *,
        chat_base_url: str,
        chat_api_key: str,
        chat_model_map: dict[AIPurpose, str],
        image_api_url: str,
        image_api_key: str,
        image_model: str,
        image_size: str,
        image_response_format: str,
        image_timeout_seconds: float,
        image_concurrency: int,
    ) -> None:
        # Chat 클라이언트는 lazy init — 키 없어도 image-only 사용 가능하게.
        self._chat_base_url = chat_base_url
        self._chat_api_key = chat_api_key
        self._chat_client: AsyncOpenAI | None = None
        self._models = chat_model_map

        self._image_api_url = image_api_url
        self._image_api_key = image_api_key
        self._image_model = image_model
        self._image_size = image_size
        self._image_response_format = image_response_format
        self._image_sem = asyncio.Semaphore(image_concurrency)
        self._http = httpx.AsyncClient(timeout=image_timeout_seconds)

    def _get_chat(self) -> AsyncOpenAI:
        if self._chat_client is None:
            if not self._chat_api_key:
                raise ExternalServiceError("AI_CHAT_API_KEY가 설정되지 않았습니다.")
            self._chat_client = AsyncOpenAI(
                base_url=self._chat_base_url, api_key=self._chat_api_key
            )
        return self._chat_client

    @classmethod
    def from_settings(cls, settings: Settings) -> AIClient:
        return cls(
            chat_base_url=settings.ai_chat_base_url,
            chat_api_key=settings.ai_chat_api_key,
            chat_model_map={
                AIPurpose.ANALYZE: settings.ai_model_analyze,
                AIPurpose.ADAPTIVE_QUESTIONS: settings.ai_model_adaptive_questions,
                AIPurpose.FINAL_QUESTION: settings.ai_model_final_question,
                AIPurpose.PERSONA: settings.ai_model_persona,
                AIPurpose.IMAGE_PROMPT: settings.ai_model_image_prompt,
            },
            image_api_url=settings.ai_image_api_url,
            image_api_key=settings.ai_image_api_key,
            image_model=settings.ai_image_model,
            image_size=settings.ai_image_size,
            image_response_format=settings.ai_image_response_format,
            image_timeout_seconds=settings.ai_image_timeout_seconds,
            image_concurrency=settings.image_concurrency,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    # ─── Chat ─────────────────────────────────────────────
    async def chat(
        self,
        purpose: AIPurpose,
        messages: list[dict[str, Any]],
        **kwargs: Any,
    ) -> Any:
        client = self._get_chat()
        return await client.chat.completions.create(
            model=self._models[purpose],
            messages=messages,
            **kwargs,
        )

    # ─── Image ────────────────────────────────────────────
    async def generate_image(
        self,
        purpose: AIPurpose,  # 라벨용 (모델 분기는 추후)
        prompt: str,
        *,
        size: str | None = None,
        n: int = 1,
    ) -> bytes:
        """이미지 생성. PNG 바이트 반환.

        외부 API 오류는 ExternalServiceError로 감싼다.
        """
        if not self._image_api_key:
            raise ExternalServiceError("AI_IMAGE_API_KEY가 설정되지 않았습니다.")

        # response_format은 설정으로 옵트인:
        # - Mindlogic: 미설정 (게이트웨이가 모르는 파라미터를 거부하는 경우 대응)
        # - OpenRouter/OpenAI 직접: "b64_json" 명시 필요
        payload: dict[str, Any] = {
            "model": self._image_model,
            "prompt": prompt,
            "n": n,
            "size": size or self._image_size,
        }
        if self._image_response_format:
            payload["response_format"] = self._image_response_format
        headers = {
            "Authorization": f"Bearer {self._image_api_key}",
            "Content-Type": "application/json",
        }

        async with self._image_sem:
            try:
                response = await self._http.post(
                    self._image_api_url, headers=headers, json=payload
                )
            except httpx.HTTPError as exc:
                raise ExternalServiceError(
                    "이미지 API 호출 실패", details={"reason": str(exc)}
                ) from exc

        if response.status_code >= 400:
            raise ExternalServiceError(
                "이미지 API가 오류를 반환했습니다.",
                details={"status": response.status_code, "body": response.text[:500]},
            )

        try:
            data = response.json()
            b64 = data["data"][0]["b64_json"]
        except (ValueError, KeyError, IndexError) as exc:
            raise ExternalServiceError(
                "이미지 API 응답 형식이 예상과 다릅니다.",
                details={"body": response.text[:500]},
            ) from exc

        return base64.b64decode(b64)
