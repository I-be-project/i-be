"""POST /api/dev/persona-card 통합 테스트 (AI 의존성 stub 주입)."""

from __future__ import annotations

import base64
import json
from io import BytesIO
from types import SimpleNamespace

import httpx
from PIL import Image

from app.deps import get_ai_client
from app.main import create_app


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 64), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    async def chat(self, purpose, messages, **kwargs):
        body = json.dumps({"portrait_prompt": "p", "background_prompt": "b"})
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=body))]
        )

    async def generate_image(self, purpose, prompt, *, size=None, n=1):
        return _png()

    async def edit_image(self, purpose, prompt, image, *, size=None):
        return _png()


async def test_persona_card_endpoint_returns_card() -> None:
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: _StubAI()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/persona-card",
            json={
                "persona": {
                    "name": "미래 도시 설계자",
                    "tagline": "분석형 리더",
                    "keywords": ["분석", "공간"],
                    "fields": ["건축공학"],
                },
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
                "qr_data": "https://nabe.test/c/x",
            },
        )
    assert res.status_code == 200
    data = res.json()
    card = base64.b64decode(data["card_base64"])
    assert card[:8] == b"\x89PNG\r\n\x1a\n"
    assert data["persona"]["name"] == "미래 도시 설계자"
