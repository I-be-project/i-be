"""AIClient.edit_image 하드닝 테스트 (httpx MockTransport, 실제 API 호출 없음)."""

from __future__ import annotations

import base64
from collections.abc import Callable
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError

_EDIT_URL = "https://img.test/edits"


def _png(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _b64_body(png: bytes) -> dict[str, object]:
    return {"data": [{"b64_json": base64.b64encode(png).decode("ascii")}]}


def _client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    api_key: str = "test-key",
    edit_url: str = _EDIT_URL,
    max_retries: int = 2,
) -> AIClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AIClient(
        chat_base_url="",
        chat_api_key="",
        chat_model_map={},
        image_api_url="https://img.test/generate",
        image_edit_api_url=edit_url,
        image_api_key=api_key,
        image_model="gpt-image-1",
        image_size="1024x1024",
        image_response_format="",
        image_timeout_seconds=5.0,
        image_concurrency=4,
        image_max_retries=max_retries,
        image_retry_base_delay=0.0,
        http_client=http,
    )


async def test_edit_success_b64() -> None:
    png = _png()
    client = _client(lambda req: httpx.Response(200, json=_b64_body(png)))
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "make future self", _png())
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    await client.aclose()


async def test_edit_sends_multipart_to_edit_url() -> None:
    seen = {"url": "", "ctype": ""}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["ctype"] = req.headers.get("content-type", "")
        return httpx.Response(200, json=_b64_body(_png()))

    client = _client(handler)
    await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert seen["url"] == _EDIT_URL
    assert seen["ctype"].startswith("multipart/form-data")
    await client.aclose()


async def test_edit_retry_on_429_then_success() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=_b64_body(_png()))

    client = _client(handler)
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert data[:4] == b"\x89PNG"
    assert calls["n"] == 2
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


async def test_edit_without_url_raises() -> None:
    client = _client(lambda req: httpx.Response(200), edit_url="")
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    await client.aclose()


async def test_edit_5xx_exhausts_retries() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, text="service unavailable")

    client = _client(handler, max_retries=2)
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert calls["n"] == 3  # 1 initial + 2 retries
    await client.aclose()


async def test_edit_rejects_invalid_input_image() -> None:
    from app.core.images import ImageValidationError

    client = _client(lambda req: httpx.Response(200, json=_b64_body(_png())))
    with pytest.raises(ImageValidationError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", b"not an image" * 10)
    await client.aclose()
