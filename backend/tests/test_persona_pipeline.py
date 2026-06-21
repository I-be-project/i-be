"""persona_pipeline.generate_card 오케스트레이션 테스트 (AI stub)."""

from __future__ import annotations

import json
from io import BytesIO
from types import SimpleNamespace

from PIL import Image

from app.adapters.ai_client import AIPurpose
from app.schemas.persona import Persona
from app.services.persona_pipeline import generate_card

_PERSONA = Persona(
    name="미래 도시 설계자",
    tagline="더 나은 삶의 공간을 기획하는 분석형 리더",
    keywords=["분석", "공간", "기획"],
    fields=["건축공학", "스마트시티"],
)


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 64), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    def __init__(self) -> None:
        self.generated: list[AIPurpose] = []
        self.edited: list[AIPurpose] = []

    async def chat(self, purpose, messages, **kwargs):
        body = json.dumps({"portrait_prompt": "portrait", "background_prompt": "bg"})
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=body))]
        )

    async def generate_image(self, purpose, prompt, *, size=None, n=1):
        self.generated.append(purpose)
        return _png()

    async def edit_image(self, purpose, prompt, image, *, size=None):
        self.edited.append(purpose)
        return _png()


async def test_generate_card_without_photo_uses_text_to_image() -> None:
    ai = _StubAI()
    result = await generate_card(ai, _PERSONA, photo=None, qr_data="https://nabe.test/c/x")
    assert result.card_png[:8] == b"\x89PNG\r\n\x1a\n"
    assert AIPurpose.PORTRAIT_IMAGE in ai.generated  # 사진 없으면 generate
    assert AIPurpose.WORLD_IMAGE in ai.generated
    assert ai.edited == []


async def test_generate_card_with_photo_uses_edit_for_portrait() -> None:
    ai = _StubAI()
    result = await generate_card(ai, _PERSONA, photo=_png(), qr_data="https://nabe.test/c/x")
    assert result.card_png[:4] == b"\x89PNG"
    assert ai.edited == [AIPurpose.PORTRAIT_IMAGE]  # 사진 있으면 edit
    assert ai.generated == [AIPurpose.WORLD_IMAGE]  # 배경은 항상 generate
