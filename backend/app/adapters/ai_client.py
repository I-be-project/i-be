"""AI 클라이언트.

- Chat: OpenAI 호환 SDK (OpenRouter). purpose → model 매핑.
- Image: OpenRouter는 이미지 생성·편집을 **/chat/completions** 한 엔드포인트로 처리한다.
        요청에 `modalities: ["image","text"]`와 `image_config`(aspect_ratio·strength)를 싣고,
        응답 `choices[0].message.images[0].image_url.url`(data URI)에서 bytes를 추출한다.
        편집(얼굴 입력)은 message content에 image_url(data URI)을 함께 넣는다.

이미지 생성은 일시적 실패(타임아웃·429·5xx·손상 응답)에 대해 지수 백오프 재시도한다.
4xx(429 제외)는 영구 오류로 보고 즉시 실패한다.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Awaitable, Callable
from enum import StrEnum
from math import gcd
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.config import Settings
from app.core.errors import ExternalServiceError
from app.core.images import ImageValidationError, inspect_image
from app.core.logging import get_logger

logger = get_logger(__name__)


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


class _RetryableImageError(Exception):
    """이미지 생성 중 재시도로 회복 가능한 일시적 실패."""


def _size_to_aspect_ratio(size: str) -> str:
    """"1024x1536" → "2:3" 처럼 픽셀 크기를 OpenRouter aspect_ratio로 변환."""
    try:
        w_str, h_str = size.lower().split("x")
        w, h = int(w_str), int(h_str)
    except (ValueError, AttributeError):
        return "1:1"
    if w <= 0 or h <= 0:
        return "1:1"
    g = gcd(w, h) or 1
    return f"{w // g}:{h // g}"


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
        image_strength: float,
        image_timeout_seconds: float,
        image_quality: str = "",
        image_concurrency: int,
        image_max_retries: int = 2,
        image_retry_base_delay: float = 0.5,
        http_client: httpx.AsyncClient | None = None,
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
        self._image_strength = image_strength
        self._image_quality = image_quality  # image_config.image_size ("" | 1K | 2K | 4K)
        self._image_max_retries = image_max_retries
        self._image_retry_base_delay = image_retry_base_delay
        self._image_sem = asyncio.Semaphore(image_concurrency)
        # http_client 주입은 테스트(MockTransport)용. 미주입 시 자체 생성.
        self._http = http_client or httpx.AsyncClient(timeout=image_timeout_seconds)

    def _get_chat(self) -> AsyncOpenAI:
        if self._chat_client is None:
            if not self._chat_api_key:
                raise ExternalServiceError("AI_API_KEY가 설정되지 않았습니다.")
            self._chat_client = AsyncOpenAI(
                base_url=self._chat_base_url, api_key=self._chat_api_key
            )
        return self._chat_client

    @classmethod
    def from_settings(cls, settings: Settings) -> AIClient:
        return cls(
            chat_base_url=settings.ai_chat_base_url,
            chat_api_key=settings.ai_api_key,
            chat_model_map={
                AIPurpose.ANALYZE: settings.ai_model_analyze,
                AIPurpose.ADAPTIVE_QUESTIONS: settings.ai_model_adaptive_questions,
                AIPurpose.FINAL_QUESTION: settings.ai_model_final_question,
                AIPurpose.PERSONA: settings.ai_model_persona,
                AIPurpose.IMAGE_PROMPT: settings.ai_model_image_prompt,
            },
            image_api_url=settings.ai_image_api_url,
            image_api_key=settings.ai_api_key,
            image_model=settings.ai_image_model,
            image_size=settings.ai_image_size,
            image_strength=settings.ai_image_strength,
            image_quality=settings.ai_image_quality,
            image_timeout_seconds=settings.ai_image_timeout_seconds,
            image_concurrency=settings.image_concurrency,
            image_max_retries=settings.ai_image_max_retries,
            image_retry_base_delay=settings.ai_image_retry_base_delay,
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

    # ─── Image (OpenRouter /chat/completions + modalities) ──────────────
    async def generate_image(
        self,
        purpose: AIPurpose,  # 라벨용 (모델 분기는 추후)
        prompt: str,
        *,
        size: str | None = None,
        n: int = 1,  # 인터페이스 호환용 (OpenRouter는 1장 반환)
    ) -> bytes:
        """텍스트→이미지 생성. 검증된 이미지 bytes 반환.

        일시적 실패는 지수 백오프로 재시도하고, 소진 시 ExternalServiceError.
        4xx(429 제외)·키 미설정 등 영구 오류는 즉시 ExternalServiceError.
        """
        if not self._image_api_key:
            raise ExternalServiceError("AI_API_KEY가 설정되지 않았습니다.")

        payload = self._image_payload(
            messages=[{"role": "user", "content": prompt}],
            aspect_ratio=_size_to_aspect_ratio(size or self._image_size),
        )

        async def _attempt() -> bytes:
            return await self._image_attempt(payload)

        return await self._run_with_image_retries(purpose, _attempt)

    async def edit_image(
        self,
        purpose: AIPurpose,
        prompt: str,
        image: bytes,
        *,
        size: str | None = None,
    ) -> bytes:
        """입력 이미지(얼굴) + 프롬프트로 image-to-image 생성. 검증된 bytes 반환.

        OpenRouter는 message content에 image_url(data URI)을 넣고 image_config.strength로
        입력 이미지 보존 정도를 조절한다(낮을수록 원본에 가까움).
        """
        if not self._image_api_key:
            raise ExternalServiceError("AI_API_KEY가 설정되지 않았습니다.")

        inspect_image(image)  # 입력 이미지(얼굴)가 유효한지 사전 검증

        data_uri = "data:image/png;base64," + base64.b64encode(image).decode("ascii")
        payload = self._image_payload(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            aspect_ratio=_size_to_aspect_ratio(size or self._image_size),
            strength=self._image_strength,
        )

        async def _attempt() -> bytes:
            return await self._image_attempt(payload)

        return await self._run_with_image_retries(purpose, _attempt)

    def _image_payload(
        self,
        *,
        messages: list[dict[str, Any]],
        aspect_ratio: str,
        strength: float | None = None,
    ) -> dict[str, Any]:
        image_config: dict[str, Any] = {"aspect_ratio": aspect_ratio}
        if self._image_quality:
            image_config["image_size"] = self._image_quality  # 1K/2K/4K (모델 지원 시)
        if strength is not None:
            image_config["strength"] = strength
        return {
            "model": self._image_model,
            "messages": messages,
            "modalities": ["image", "text"],
            "image_config": image_config,
        }

    async def _run_with_image_retries(
        self, purpose: AIPurpose, attempt: Callable[[], Awaitable[bytes]]
    ) -> bytes:
        """이미지 1회 시도(attempt)를 검증·지수백오프 재시도로 감싼다."""
        last_error: Exception | None = None
        for n in range(self._image_max_retries + 1):
            try:
                data = await attempt()
                inspect_image(data)
                return data
            except (_RetryableImageError, ImageValidationError) as exc:
                last_error = exc
                if n < self._image_max_retries:
                    delay = self._image_retry_base_delay * (2**n)
                    logger.warning(
                        "image.retry",
                        purpose=str(purpose),
                        attempt=n + 1,
                        max_attempts=self._image_max_retries + 1,
                        delay=delay,
                        reason=str(exc),
                    )
                    await asyncio.sleep(delay)
                    continue
                break
        raise ExternalServiceError(
            "이미지 생성에 실패했습니다 (재시도 소진).",
            details={
                "purpose": str(purpose),
                "attempts": self._image_max_retries + 1,
                "reason": str(last_error),
            },
        )

    async def _image_attempt(self, payload: dict[str, Any]) -> bytes:
        """이미지 API 1회 호출 → bytes. 일시적 실패는 _RetryableImageError로,
        영구 실패(4xx)는 ExternalServiceError로 던진다."""
        headers = {
            "Authorization": f"Bearer {self._image_api_key}",
            "Content-Type": "application/json",
        }
        async with self._image_sem:
            try:
                response = await self._http.post(self._image_api_url, headers=headers, json=payload)
            except httpx.TimeoutException as exc:
                raise _RetryableImageError(f"timeout: {exc}") from exc
            except httpx.HTTPError as exc:
                raise _RetryableImageError(f"network: {exc}") from exc

        if response.status_code == 429 or response.status_code >= 500:
            raise _RetryableImageError(f"status {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise ExternalServiceError(
                "이미지 API가 오류를 반환했습니다.",
                details={"status": response.status_code, "body": response.text[:500]},
            )

        return await self._extract_image_bytes(response)

    async def _extract_image_bytes(self, response: httpx.Response) -> bytes:
        """OpenRouter chat 응답에서 이미지 bytes 추출.

        주 형태: {"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,..."}}]}}]}
        url이 원격(https)이면 fetch. data URI면 base64 디코드.
        """
        try:
            body = response.json()
        except ValueError as exc:
            raise _RetryableImageError(f"non-JSON body: {response.text[:200]}") from exc

        url = _first_image_url(body)
        if url is None:
            raise _RetryableImageError(f"응답에 이미지가 없습니다: {response.text[:200]}")

        if url.startswith("data:"):
            try:
                b64 = url.split(",", 1)[1]
                return base64.b64decode(b64)
            except (ValueError, IndexError, TypeError) as exc:
                raise _RetryableImageError(f"bad data URI: {exc}") from exc
        return await self._fetch_image_url(url)

    async def _fetch_image_url(self, url: str) -> bytes:
        async with self._image_sem:
            try:
                resp = await self._http.get(url)
            except httpx.HTTPError as exc:
                raise _RetryableImageError(f"image url fetch 실패: {exc}") from exc
        if resp.status_code >= 400:
            raise _RetryableImageError(f"image url status {resp.status_code}")
        return resp.content


def _first_image_url(body: Any) -> str | None:
    """OpenRouter chat 응답 본문에서 첫 이미지 url(data URI 또는 https)을 찾는다."""
    if not isinstance(body, dict):
        return None
    choices = body.get("choices")
    if not (isinstance(choices, list) and choices and isinstance(choices[0], dict)):
        return None
    message = choices[0].get("message")
    if not isinstance(message, dict):
        return None
    images = message.get("images")
    if not (isinstance(images, list) and images and isinstance(images[0], dict)):
        return None
    image_url = images[0].get("image_url")
    if isinstance(image_url, dict):
        url = image_url.get("url")
        return url if isinstance(url, str) and url else None
    return None
