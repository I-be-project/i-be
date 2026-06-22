"""AIClient.list_image_models 테스트 (httpx MockTransport, 실제 API 호출 없음).

/models 카탈로그에서 이미지 출력 모델을 거르고 가격을 정규화하며,
목록에 없는 _EXTRA_IMAGE_MODELS는 endpoints API로 보강하는지 검증한다.
"""

from __future__ import annotations

import json

import httpx

from app.adapters.ai_client import AIClient

_BASE = "https://or.test/api/v1"

_CATALOG = {
    "data": [
        {
            "id": "google/gemini-2.5-flash-image",
            "name": "Google: Nano Banana",
            "architecture": {"output_modalities": ["image", "text"]},
            "pricing": {"prompt": "0.0000003", "completion": "0.0000025"},
        },
        {
            "id": "openai/gpt-5-image",
            "name": "OpenAI: GPT-5 Image",
            "architecture": {"output_modalities": ["image", "text"]},
            "pricing": {"prompt": "0.00001", "completion": "0.00001"},
        },
        {
            "id": "openai/gpt-5.2",  # 텍스트 전용 → 제외돼야 함
            "name": "OpenAI: GPT-5.2",
            "architecture": {"output_modalities": ["text"]},
            "pricing": {"prompt": "0.000001", "completion": "0.000002"},
        },
        {
            "id": "openrouter/auto",  # 라우터 → 제외돼야 함
            "name": "Auto Router",
            "architecture": {"output_modalities": ["image", "text"]},
            "pricing": {"prompt": "-1", "completion": "-1"},
        },
    ]
}

_GROK_ENDPOINTS = {
    "data": {
        "id": "x-ai/grok-imagine-image-quality",
        "name": "xAI: Grok Imagine Image Quality",
        "architecture": {"output_modalities": ["image"]},
        "endpoints": [{"provider_name": "xAI", "pricing": {"image": "0.01"}}],
    }
}


def _handler(req: httpx.Request) -> httpx.Response:
    path = req.url.path
    if path.endswith("/models"):
        return httpx.Response(200, json=_CATALOG)
    if path.endswith("/models/x-ai/grok-imagine-image-quality/endpoints"):
        return httpx.Response(200, json=_GROK_ENDPOINTS)
    return httpx.Response(404, text=json.dumps({"error": "not found"}))


def _client() -> AIClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(_handler))
    return AIClient(
        chat_base_url=_BASE,
        chat_api_key="",
        chat_model_map={},
        image_api_url=f"{_BASE}/chat/completions",
        image_api_key="test-key",
        image_model="google/gemini-2.5-flash-image",
        image_size="1024x1024",
        image_strength=0.5,
        image_timeout_seconds=5.0,
        image_concurrency=4,
        http_client=http,
    )


async def test_lists_image_models_with_normalized_pricing() -> None:
    client = _client()
    models = await client.list_image_models()
    await client.aclose()

    by_id = {m["id"]: m for m in models}

    # 텍스트 전용·라우터는 제외
    assert "openai/gpt-5.2" not in by_id
    assert "openrouter/auto" not in by_id

    # 토큰 과금 모델 → per 1M 정규화 (0.0000025 * 1e6 = 2.5)
    nb = by_id["google/gemini-2.5-flash-image"]
    assert nb["input_per_m"] == 0.3
    assert nb["output_per_m"] == 2.5
    assert nb["per_image"] is None

    gpt = by_id["openai/gpt-5-image"]
    assert gpt["output_per_m"] == 10.0


async def test_includes_extra_model_with_per_image_pricing() -> None:
    client = _client()
    models = await client.list_image_models()
    await client.aclose()

    by_id = {m["id"]: m for m in models}
    grok = by_id["x-ai/grok-imagine-image-quality"]
    assert grok["name"] == "xAI: Grok Imagine Image Quality"
    # per-image 과금 → per_image만 채워지고 토큰 가격은 없음
    assert grok["per_image"] == 0.01
    assert grok["input_per_m"] is None
    assert grok["output_per_m"] is None
