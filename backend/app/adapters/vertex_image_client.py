"""Vertex AI(Google Cloud) Gemini 이미지 어댑터 — dev 전용.

google-genai SDK를 vertexai=True로 써서 GCP 프로젝트 크레딧으로 과금된다.
인증은 서비스 계정에 연결한 API 키(VERTEX_API_KEY), 없으면 ADC. GCP_PROJECT는 항상 필요하다.

Imagen(imagen-3.0-generate-*)이 아니라 Gemini 이미지 모델을 쓴다 — Imagen 생성은
텍스트만 받아 학생 얼굴을 입력으로 넣을 수 없고, 미래 사진은 사진·실루엣·배경
세 장을 함께 보고 그려야 한다.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import errors, types

from app.config import Settings
from app.core.errors import ExternalServiceError
from app.core.images import ImageValidationError, inspect_image
from app.core.logging import get_logger

logger = get_logger(__name__)

# $ / 1M 토큰: (입력, 텍스트·사고 출력, 이미지 출력). Google 공개가(2026-10 OpenRouter 조회값과 동일).
# ponytail: 단가를 손으로 적어 둔다 — 가격이 바뀌면 여기를 고치고, 정확한 금액은 결제 보고서가 기준.
_PRICES: dict[str, tuple[float, float, float]] = {
    "gemini-3.1-flash-image": (0.5, 3.0, 60.0),
    "gemini-nano-banana-2.1": (1.5, 7.5, 30.0),
    "gemini-3-pro-image": (2.0, 12.0, 120.0),
}


class ImageRefusedError(ExternalServiceError):
    """모델이 사진 문제로 생성을 거절했다(텍스트로 이유를 답함). 재시도해도 결과가 같다."""


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    cost_usd: float | None  # 단가표에 없는 모델이면 None


def estimate_cost(model: str, usage: Any) -> float | None:
    """응답 usage_metadata → 추정 비용($). 이미지 출력 토큰만 이미지 단가로 센다."""
    price = _PRICES.get(model)
    if price is None or usage is None:
        return None
    input_rate, text_rate, image_rate = price
    out_total = usage.candidates_token_count or 0
    out_image = sum(
        d.token_count or 0
        for d in usage.candidates_tokens_details or []
        if d.modality == types.MediaModality.IMAGE
    )
    text_tokens = out_total - out_image + (usage.thoughts_token_count or 0)
    usd = (
        (usage.prompt_token_count or 0) * input_rate
        + text_tokens * text_rate
        + out_image * image_rate
    ) / 1_000_000
    return round(usd, 4)


@dataclass(frozen=True)
class VertexAccount:
    """GCP 프로젝트 하나와 그 인증. 할당량은 프로젝트 단위라 계정을 늘리려면 프로젝트가 달라야 한다."""

    project: str
    api_key: str = ""  # 서비스 계정 연결 API 키. 비우면 ADC(gcloud auth application-default login)


class VertexImageClient:
    def __init__(
        self,
        *,
        accounts: Sequence[VertexAccount],
        location: str,
        model: str,
        image_size: str,
        clients: Sequence[Any] | None = None,  # 테스트에서 가짜 genai.Client 주입용(계정 순서대로)
        retry_delays: Sequence[float] = (5.0, 15.0),  # 일시적 오류 재시도 간격(초)
    ) -> None:
        self._accounts = [a for a in accounts if a.project]
        self._location = location
        self._model = model
        self._image_size = image_size
        self._clients: list[Any] = (
            list(clients) if clients is not None else [None] * len(self._accounts)
        )
        self._next = 0
        self._retry_delays = tuple(retry_delays)

    @classmethod
    def from_settings(cls, settings: Settings) -> VertexImageClient:
        return cls(
            accounts=[
                VertexAccount(settings.gcp_project, settings.vertex_api_key),
                VertexAccount(settings.gcp_project_2, settings.vertex_api_key_2),
            ],
            location=settings.gcp_location,
            model=settings.vertex_image_model,
            image_size=settings.vertex_image_size,
        )

    def _get(self) -> Any:
        """다음 계정의 클라이언트 — 호출마다 계정을 번갈아 써서 프로젝트별 할당량을 나눠 쓴다.

        재시도도 이걸 거치므로 한 계정이 429면 다음 시도는 다른 계정으로 간다.
        """
        if not self._clients:
            raise ExternalServiceError("GCP_PROJECT가 설정되지 않았습니다.")
        i = self._next % len(self._clients)
        self._next += 1
        if self._clients[i] is None:
            # 생성 시 인증 정보를 읽는다 — 키가 없는 환경에서도 앱 기동·다른 dev 기능은 동작하게 지연 생성.
            # API 키만 주면 SDK가 express 모드로 키의 기본 리전(asia-southeast1 등)에 보내는데,
            # Gemini 3 이미지 모델은 global에만 있어 404가 난다 — 프로젝트·리전을 함께 넘긴다.
            account = self._accounts[i]
            self._clients[i] = genai.Client(
                vertexai=True,
                api_key=account.api_key or None,
                project=account.project,
                location=self._location,
            )
        return self._clients[i]

    async def generate_image(
        self,
        prompt: str,
        images: Sequence[bytes],
        *,
        aspect_ratio: str,
        model: str | None = None,
    ) -> GeneratedImage:
        """프롬프트 + 입력 이미지들(순서 = 프롬프트의 첫/두/세 번째 이미지) → 이미지 + 추정 비용.

        이미지가 없으면 모델의 텍스트 답(예: "얼굴이 가려져 생성 불가")을 사유로 올린다.
        """
        parts: list[Any] = [prompt]
        for data in images:
            parts.append(
                types.Part.from_bytes(data=data, mime_type=inspect_image(data).content_type)
            )
        image_config = types.ImageConfig(aspect_ratio=aspect_ratio)
        if self._image_size:
            image_config.image_size = self._image_size
        model = model or self._model
        config = types.GenerateContentConfig(
            # TEXT도 받아야 생성을 거절할 때 이유가 돌아온다.
            response_modalities=["IMAGE", "TEXT"],
            image_config=image_config,
        )
        for attempt, delay in enumerate((*self._retry_delays, None)):
            try:
                response = await self._get().aio.models.generate_content(
                    model=model, contents=parts, config=config
                )
                break
            except errors.APIError as exc:
                # 429(할당량)·5xx는 잠깐 뒤 회복된다 — 자동 공개는 실패하면 폴백 카드로
                # 굳어지므로 바로 포기하지 않는다. 4xx는 다시 해도 같다.
                if delay is None or not (exc.code == 429 or (exc.code or 0) >= 500):
                    raise ExternalServiceError(
                        f"Vertex AI 이미지 API 오류({exc.code})",
                        details={"message": str(exc)[:500], "attempts": attempt + 1},
                    ) from exc
                logger.warning("vertex.image.retry", status=exc.code, attempt=attempt + 1)
                await asyncio.sleep(delay)

        texts: list[str] = []
        for part in response.parts or []:
            if part.thought:
                # 사고 요약은 답이 아니다 — 거절 사유로 읽으면 멀쩡한 사진을 폴백으로 공개한다.
                continue
            if part.inline_data and part.inline_data.data:
                data = part.inline_data.data
                try:
                    inspect_image(data)
                except ImageValidationError as exc:
                    raise ExternalServiceError(
                        f"Vertex AI 응답 이미지가 손상됐습니다: {exc}"
                    ) from exc
                return GeneratedImage(bytes(data), estimate_cost(model, response.usage_metadata))
            if part.text:
                texts.append(part.text)
        if texts:
            # 모델이 이미지 대신 이유를 답했다 — 얼굴 없음 등 사진 문제. 다시 해도 같다.
            # 문구 앞부분은 검수 화면의 '거절' 분류(draft_repo._REFUSED)와 맞춘다.
            reason = " ".join(texts).strip()[:300]
            raise ImageRefusedError(f"Vertex AI가 이미지를 만들지 않았습니다: {reason}")
        candidates = getattr(response, "candidates", None) or []
        finish = candidates[0].finish_reason if candidates else None
        raise ExternalServiceError(f"Vertex AI가 이미지 없이 응답을 끝냈습니다({finish})")
