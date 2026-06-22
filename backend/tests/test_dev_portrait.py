"""POST /api/dev/portrait 통합 테스트 (AI 의존성 stub 주입)."""

from __future__ import annotations

import base64
from io import BytesIO

import httpx
from PIL import Image

from app.deps import get_ai_client
from app.main import create_app


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 96), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def edit_image(self, purpose, prompt, image, *, size=None, model=None):
        self.calls.append({"prompt": prompt, "size": size, "model": model})
        return _png()


async def test_portrait_endpoint_returns_image_and_echoes_model() -> None:
    stub = _StubAI()
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: stub
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/portrait",
            json={
                "prompt": "portrait prompt",
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
                "model": "openai/some-model",
            },
        )
    assert res.status_code == 200
    data = res.json()
    img = base64.b64decode(data["image_base64"])
    assert img[:8] == b"\x89PNG\r\n\x1a\n"
    assert data["model"] == "openai/some-model"
    assert data["width"] == 64 and data["height"] == 96
    # edit_image가 모델 오버라이드와 함께 호출됐는지
    assert stub.calls[0]["model"] == "openai/some-model"
    assert stub.calls[0]["size"] == "1024x1536"


async def test_portrait_endpoint_defaults_model_when_omitted() -> None:
    stub = _StubAI()
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: stub
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/portrait",
            json={
                "prompt": "portrait prompt",
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
            },
        )
    assert res.status_code == 200
    data = res.json()
    # model 미지정 → 응답엔 settings 기본 모델, edit_image엔 None(클라이언트 기본값 사용)
    assert data["model"] != ""
    assert stub.calls[0]["model"] is None
