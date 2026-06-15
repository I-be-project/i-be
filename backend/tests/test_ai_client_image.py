"""AIClient.generate_image 하드닝 테스트 (httpx MockTransport, 실제 API 호출 없음)."""

from __future__ import annotations

import base64
from collections.abc import Callable
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError

_GEN_URL = "https://img.test/generate"


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
    max_retries: int = 2,
) -> AIClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AIClient(
        chat_base_url="",
        chat_api_key="",
        chat_model_map={},
        image_api_url=_GEN_URL,
        image_api_key=api_key,
        image_model="gpt-image-1",
        image_size="1024x1024",
        image_response_format="",
        image_timeout_seconds=5.0,
        image_concurrency=4,
        image_max_retries=max_retries,
        image_retry_base_delay=0.0,  # 테스트는 sleep 0
        http_client=http,
    )


async def test_success_b64() -> None:
    png = _png()
    client = _client(lambda req: httpx.Response(200, json=_b64_body(png)))
    data = await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "prompt")
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    await client.aclose()


async def test_retry_on_429_then_success() -> None:
    png = _png()
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=_b64_body(png))

    client = _client(handler)
    data = await client.generate_image(AIPurpose.WORLD_IMAGE, "p")
    assert data[:4] == b"\x89PNG"
    assert calls["n"] == 2
    await client.aclose()


async def test_5xx_exhausts_retries() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, text="unavailable")

    client = _client(handler, max_retries=2)
    with pytest.raises(ExternalServiceError):
        await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    assert calls["n"] == 3  # 1 + 2 재시도
    await client.aclose()


async def test_4xx_fails_fast() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    client = _client(handler)
    with pytest.raises(ExternalServiceError):
        await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    assert calls["n"] == 1  # 재시도 없이 즉시 실패
    await client.aclose()


async def test_missing_image_in_body_retries_then_fails() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"data": [{}]})

    client = _client(handler)
    with pytest.raises(ExternalServiceError):
        await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    assert calls["n"] == 3
    await client.aclose()


async def test_non_image_payload_rejected() -> None:
    calls = {"n": 0}
    bad = base64.b64encode(b"not really an image" * 10).decode("ascii")

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"data": [{"b64_json": bad}]})

    client = _client(handler)
    with pytest.raises(ExternalServiceError):
        await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    assert calls["n"] == 3
    await client.aclose()


async def test_url_based_response_fetched() -> None:
    png = _png()

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/generate"):
            return httpx.Response(200, json={"data": [{"url": "https://img.test/out.png"}]})
        return httpx.Response(200, content=png)

    client = _client(handler)
    data = await client.generate_image(AIPurpose.WORLD_IMAGE, "p")
    assert data[:4] == b"\x89PNG"
    await client.aclose()


async def test_missing_api_key_raises_immediately() -> None:
    client = _client(lambda req: httpx.Response(200), api_key="")
    with pytest.raises(ExternalServiceError):
        await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    await client.aclose()
