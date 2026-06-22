"""AIClient.edit_image 하드닝 테스트 (httpx MockTransport, 실제 API 호출 없음).

OpenRouter는 이미지 편집(얼굴 입력)도 /chat/completions로 처리한다:
message content에 image_url(data URI) + image_config.strength.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError
from app.core.images import ImageValidationError

_URL = "https://img.test/chat/completions"


def _png(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _img_body(png: bytes) -> dict[str, object]:
    uri = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    return {"choices": [{"message": {"images": [{"image_url": {"url": uri}}]}}]}


def _client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    api_key: str = "test-key",
    strength: float = 0.5,
    max_retries: int = 2,
) -> AIClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AIClient(
        chat_base_url="",
        chat_api_key="",
        chat_model_map={},
        image_api_url=_URL,
        image_api_key=api_key,
        image_model="google/gemini-2.5-flash-image",
        image_size="1024x1024",
        image_strength=strength,
        image_timeout_seconds=5.0,
        image_concurrency=4,
        image_max_retries=max_retries,
        image_retry_base_delay=0.0,
        http_client=http,
    )


async def test_edit_success() -> None:
    client = _client(lambda req: httpx.Response(200, json=_img_body(_png())))
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "make future self", _png())
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    await client.aclose()


async def test_edit_sends_image_url_and_strength() -> None:
    """편집 요청은 image_url(data URI) + image_config.strength + modalities를 담는다."""
    src = _png()
    seen: dict[str, object] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=_img_body(_png()))

    client = _client(handler)
    await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "make future self", src, size="1024x1536")

    assert seen["url"] == _URL
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["modalities"] == ["image"]
    assert body["image_config"]["aspect_ratio"] == "2:3"
    assert body["image_config"]["strength"] == 0.5
    content = body["messages"][0]["content"]
    text_part = next(p for p in content if p["type"] == "text")
    img_part = next(p for p in content if p["type"] == "image_url")
    assert text_part["text"] == "make future self"
    expected_uri = "data:image/png;base64," + base64.b64encode(src).decode("ascii")
    assert img_part["image_url"]["url"] == expected_uri
    await client.aclose()


async def test_edit_retry_on_429_then_success() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=_img_body(_png()))

    client = _client(handler)
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert data[:4] == b"\x89PNG"
    assert calls["n"] == 2
    await client.aclose()


async def test_edit_5xx_exhausts_retries() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, text="unavailable")

    client = _client(handler, max_retries=2)
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert calls["n"] == 3
    await client.aclose()


async def test_edit_4xx_fails_fast() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    client = _client(handler)
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert calls["n"] == 1
    await client.aclose()


async def test_edit_rejects_invalid_input_image() -> None:
    client = _client(lambda req: httpx.Response(200, json=_img_body(_png())))
    with pytest.raises(ImageValidationError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", b"not an image" * 10)
    await client.aclose()


async def test_edit_missing_api_key_raises() -> None:
    client = _client(lambda req: httpx.Response(200), api_key="")
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    await client.aclose()
