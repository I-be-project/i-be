"""Vertex AI(Google Cloud) Gemini 이미지 어댑터 — dev 전용.

google-genai SDK를 vertexai=True로 써서 GCP 프로젝트 크레딧으로 과금된다.
인증은 서비스 계정에 연결한 API 키(VERTEX_API_KEY), 없으면 ADC. GCP_PROJECT는 항상 필요하다.

Imagen(imagen-3.0-generate-*)이 아니라 Gemini 이미지 모델을 쓴다 — Imagen 생성은
텍스트만 받아 학생 얼굴을 입력으로 넣을 수 없고, 미래 사진은 사진·실루엣·배경
세 장을 함께 보고 그려야 한다.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import errors, types

from app.config import Settings
from app.core.errors import ExternalServiceError
from app.core.images import ImageValidationError, inspect_image

# $ / 1M 토큰: (입력, 텍스트·사고 출력, 이미지 출력). Google 공개가(2026-10 OpenRouter 조회값과 동일).
# ponytail: 단가를 손으로 적어 둔다 — 가격이 바뀌면 여기를 고치고, 정확한 금액은 결제 보고서가 기준.
_PRICES: dict[str, tuple[float, float, float]] = {
    "gemini-3.1-flash-image": (0.5, 3.0, 60.0),
    "gemini-nano-banana-2.1": (1.5, 7.5, 30.0),
    "gemini-3-pro-image": (2.0, 12.0, 120.0),
}


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


class VertexImageClient:
    def __init__(
        self,
        *,
        api_key: str,
        project: str,
        location: str,
        model: str,
        image_size: str,
        client: Any = None,  # 테스트에서 가짜 genai.Client 주입용
    ) -> None:
        self._api_key = api_key
        self._project = project
        self._location = location
        self._model = model
        self._image_size = image_size
        self._client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> VertexImageClient:
        return cls(
            api_key=settings.vertex_api_key,
            project=settings.gcp_project,
            location=settings.gcp_location,
            model=settings.vertex_image_model,
            image_size=settings.vertex_image_size,
        )

    def _get(self) -> Any:
        # 생성 시 인증 정보를 읽는다 — 키가 없는 환경에서도 앱 기동·다른 dev 기능은 동작하게 지연 생성.
        if self._client is None:
            if not self._project:
                raise ExternalServiceError("GCP_PROJECT가 설정되지 않았습니다.")
            # API 키만 주면 SDK가 express 모드로 키의 기본 리전(asia-southeast1 등)에 보내는데,
            # Gemini 3 이미지 모델은 global에만 있어 404가 난다 — 프로젝트·리전을 함께 넘긴다.
            # 키가 없으면 ADC(gcloud auth application-default login)로 인증한다.
            self._client = genai.Client(
                vertexai=True,
                api_key=self._api_key or None,
                project=self._project,
                location=self._location,
            )
        return self._client

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
        try:
            response = await self._get().aio.models.generate_content(
                model=model,
                contents=parts,
                # TEXT도 받아야 생성을 거절할 때 이유가 돌아온다.
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"], image_config=image_config
                ),
            )
        except errors.APIError as exc:
            raise ExternalServiceError(
                "Vertex AI 이미지 API가 오류를 반환했습니다.",
                details={"status": exc.code, "message": str(exc)[:500]},
            ) from exc

        texts: list[str] = []
        for part in response.parts or []:
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
        reason = " ".join(texts).strip()[:300] or "(응답 없음)"
        raise ExternalServiceError(f"Vertex AI가 이미지를 만들지 않았습니다: {reason}")
