"""AI 클라이언트.

- Chat: OpenAI 호환 SDK (OpenRouter 또는 OpenAI 직접). purpose → model 매핑.
- Image: 커스텀 엔드포인트 (Mindlogic 등) 지원을 위해 httpx 직접 호출.
        응답(b64_json 또는 url)을 PNG 등 bytes로 디코드, 검증 후 반환.

이미지 생성은 일시적 실패(타임아웃·429·5xx·손상 응답)에 대해 지수 백오프 재시도한다.
4xx(429 제외)는 영구 오류로 보고 즉시 실패한다.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Awaitable, Callable
from enum import StrEnum
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


class AIClient:
    def __init__(
        self,
        *,
        chat_base_url: str,
        chat_api_key: str,
        chat_model_map: dict[AIPurpose, str],
        image_api_url: str,
        image_edit_api_url: str = "",
        image_api_key: str,
        image_model: str,
        image_size: str,
        image_response_format: str,
        image_timeout_seconds: float,
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
        self._image_edit_api_url = image_edit_api_url
        self._image_api_key = image_api_key
        self._image_model = image_model
        self._image_size = image_size
        self._image_response_format = image_response_format
        self._image_max_retries = image_max_retries
        self._image_retry_base_delay = image_retry_base_delay
        self._image_sem = asyncio.Semaphore(image_concurrency)
        # http_client 주입은 테스트(MockTransport)용. 미주입 시 자체 생성.
        self._http = http_client or httpx.AsyncClient(timeout=image_timeout_seconds)

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
            image_edit_api_url=settings.ai_image_edit_api_url,
            image_api_key=settings.ai_image_api_key,
            image_model=settings.ai_image_model,
            image_size=settings.ai_image_size,
            image_response_format=settings.ai_image_response_format,
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

    # ─── Image ────────────────────────────────────────────
    async def generate_image(
        self,
        purpose: AIPurpose,  # 라벨용 (모델 분기는 추후)
        prompt: str,
        *,
        size: str | None = None,
        n: int = 1,
    ) -> bytes:
        """이미지 생성. 검증된 이미지 bytes 반환.

        일시적 실패는 지수 백오프로 재시도하고, 소진 시 ExternalServiceError.
        4xx(429 제외)·키 미설정 등 영구 오류는 즉시 ExternalServiceError.
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

        async def _attempt() -> bytes:
            return await self._image_attempt(payload, headers)

        return await self._run_with_image_retries(purpose, _attempt)

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

    async def edit_image(
        self,
        purpose: AIPurpose,
        prompt: str,
        image: bytes,
        *,
        size: str | None = None,
    ) -> bytes:
        """입력 이미지(얼굴) + 프롬프트로 image-edit 생성. 검증된 bytes 반환."""
        if not self._image_api_key:
            raise ExternalServiceError("AI_IMAGE_API_KEY가 설정되지 않았습니다.")
        if not self._image_edit_api_url:
            raise ExternalServiceError("AI_IMAGE_EDIT_API_URL이 설정되지 않았습니다.")

        async def _attempt() -> bytes:
            return await self._image_edit_attempt(prompt, image, size)

        return await self._run_with_image_retries(purpose, _attempt)

    async def _image_edit_attempt(
        self, prompt: str, image: bytes, size: str | None
    ) -> bytes:
        """edits 엔드포인트 multipart 1회 호출 → bytes."""
        data: dict[str, str] = {
            "model": self._image_model,
            "prompt": prompt,
            "size": size or self._image_size,
            "n": "1",
        }
        if self._image_response_format:
            data["response_format"] = self._image_response_format
        files = {"image": ("photo.png", image, "image/png")}
        headers = {"Authorization": f"Bearer {self._image_api_key}"}  # 멀티파트는 httpx가 Content-Type 설정

        async with self._image_sem:
            try:
                response = await self._http.post(
                    self._image_edit_api_url, headers=headers, data=data, files=files
                )
            except httpx.TimeoutException as exc:
                raise _RetryableImageError(f"timeout: {exc}") from exc
            except httpx.HTTPError as exc:
                raise _RetryableImageError(f"network: {exc}") from exc

        if response.status_code == 429 or response.status_code >= 500:
            raise _RetryableImageError(f"status {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise ExternalServiceError(
                "이미지 edit API가 오류를 반환했습니다.",
                details={"status": response.status_code, "body": response.text[:500]},
            )

        return await self._extract_image_bytes(response)

    async def _image_attempt(self, payload: dict[str, Any], headers: dict[str, str]) -> bytes:
        """이미지 API 1회 호출 → bytes. 일시적 실패는 _RetryableImageError로,
        영구 실패(4xx)는 ExternalServiceError로 던진다."""
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
        """OpenAI 호환 이미지 응답에서 bytes 추출.

        지원 형태:
        - {"data": [{"b64_json": "..."}]}  (Mindlogic/OpenAI 기본)
        - {"data": [{"url": "https://..."}]}  (일부 게이트웨이 — 원격 fetch)
        - {"b64_json": "..."} / {"url": "..."}  (top-level 변형)
        """
        try:
            body = response.json()
        except ValueError as exc:
            raise _RetryableImageError(f"non-JSON body: {response.text[:200]}") from exc

        item: dict[str, Any] = {}
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, list) and data and isinstance(data[0], dict):
            item = data[0]

        b64 = item.get("b64_json") or (body.get("b64_json") if isinstance(body, dict) else None)
        if b64:
            try:
                return base64.b64decode(b64)
            except (ValueError, TypeError) as exc:
                raise _RetryableImageError(f"bad base64: {exc}") from exc

        url = item.get("url") or (body.get("url") if isinstance(body, dict) else None)
        if url:
            return await self._fetch_image_url(str(url))

        raise _RetryableImageError(f"응답에 이미지(b64_json/url)가 없습니다: {response.text[:200]}")

    async def _fetch_image_url(self, url: str) -> bytes:
        async with self._image_sem:
            try:
                resp = await self._http.get(url)
            except httpx.HTTPError as exc:
                raise _RetryableImageError(f"image url fetch 실패: {exc}") from exc
        if resp.status_code >= 400:
            raise _RetryableImageError(f"image url status {resp.status_code}")
        return resp.content
