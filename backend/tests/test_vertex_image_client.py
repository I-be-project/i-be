"""VertexImageClient — 가짜 genai 클라이언트로 요청 구성·응답 해석만 확인한다(실제 API 호출 없음)."""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import types
from PIL import Image

from app.adapters.vertex_image_client import VertexAccount, VertexImageClient, estimate_cost
from app.core.errors import ExternalServiceError


def _img(fmt: str) -> bytes:
    buf = BytesIO()
    # 단색은 PNG가 100바이트 미만으로 줄어 inspect_image 최소 크기에 걸린다 — 노이즈로 채운다.
    Image.effect_noise((32, 40), 64).convert("RGB").save(buf, format=fmt)
    return buf.getvalue()


class _FakeModels:
    def __init__(self, parts: list[types.Part]) -> None:
        self._parts = parts
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return SimpleNamespace(parts=self._parts, usage_metadata=None)


def _client(parts: list[types.Part]) -> tuple[VertexImageClient, _FakeModels]:
    models = _FakeModels(parts)
    fake = SimpleNamespace(aio=SimpleNamespace(models=models))
    client = VertexImageClient(
        accounts=[VertexAccount("p")],
        location="global",
        model="default-model",
        image_size="1K",
        clients=[fake],
    )
    return client, models


async def test_sends_images_in_order_and_returns_image() -> None:
    photo, layout, out = _img("JPEG"), _img("PNG"), _img("PNG")
    client, models = _client([types.Part.from_bytes(data=out, mime_type="image/png")])

    data = await client.generate_image("prompt", [photo, layout], aspect_ratio="4:5")

    assert data.data == out
    assert data.cost_usd is None  # 단가표에 없는 모델
    call = models.calls[0]
    assert call["model"] == "default-model"
    text, *images = call["contents"]
    assert text == "prompt"
    assert [(p.inline_data.mime_type, p.inline_data.data) for p in images] == [
        ("image/jpeg", photo),
        ("image/png", layout),
    ]
    image_config = call["config"].image_config
    assert (image_config.aspect_ratio, image_config.image_size) == ("4:5", "1K")


async def test_refusal_text_becomes_error_reason() -> None:
    client, _ = _client([types.Part.from_text(text="얼굴이 가려져 생성할 수 없습니다.")])
    with pytest.raises(ExternalServiceError, match="얼굴이 가려져"):
        await client.generate_image("prompt", [_img("PNG")], aspect_ratio="4:5")


async def test_missing_auth_fails_without_client() -> None:
    client = VertexImageClient(
        accounts=[VertexAccount("")], location="global", model="m", image_size=""
    )
    with pytest.raises(ExternalServiceError, match="GCP_PROJECT"):
        await client.generate_image("prompt", [_img("PNG")], aspect_ratio="4:5")


def test_estimate_cost_prices_image_tokens_separately() -> None:
    usage = types.GenerateContentResponseUsageMetadata(
        prompt_token_count=2_000,
        candidates_token_count=1_200,
        thoughts_token_count=300,
        candidates_tokens_details=[
            types.ModalityTokenCount(modality=types.MediaModality.IMAGE, token_count=1_120),
            types.ModalityTokenCount(modality=types.MediaModality.TEXT, token_count=80),
        ],
    )
    # 입력 2000 * 0.5 + 텍스트·사고 (80+300) * 3 + 이미지 1120 * 60  (/1M)
    assert estimate_cost("gemini-3.1-flash-image", usage) == round(
        (2_000 * 0.5 + 380 * 3.0 + 1_120 * 60.0) / 1_000_000, 4
    )
    assert estimate_cost("unknown-model", usage) is None
