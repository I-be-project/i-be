"""ai_service.generate_image_prompts 파싱·검증·폴백 테스트 (chat stub)."""

from __future__ import annotations

import json
from types import SimpleNamespace

from app.schemas.persona import ImagePrompts, Persona
from app.services.ai_service import generate_image_prompts

_PERSONA = Persona(
    name="숲을 지키는 드론 전문가",
    tagline="자연과 기술로 생태를 지키는 미래형 탐사 역할",
    keywords=["자연", "드론", "탐사"],
    fields=["환경공학", "항공기술"],
)


def _chat_response(content: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


class _StubAI:
    """chat 응답을 순서대로 돌려주는 stub."""

    def __init__(self, contents: list[str]) -> None:
        self._contents = contents
        self.calls = 0

    async def chat(self, purpose, messages, **kwargs):
        content = self._contents[min(self.calls, len(self._contents) - 1)]
        self.calls += 1
        return _chat_response(content)


async def test_valid_json_parsed() -> None:
    body = json.dumps(
        {"portrait_prompt": "a future drone ranger portrait", "background_prompt": "a forest"}
    )
    ai = _StubAI([body])
    result = await generate_image_prompts(ai, _PERSONA)
    assert isinstance(result, ImagePrompts)
    assert result.portrait_prompt == "a future drone ranger portrait"
    assert ai.calls == 1


async def test_retries_once_on_bad_json_then_succeeds() -> None:
    good = json.dumps({"portrait_prompt": "p", "background_prompt": "b"})
    ai = _StubAI(["not json at all", good])
    result = await generate_image_prompts(ai, _PERSONA)
    assert result.portrait_prompt == "p"
    assert ai.calls == 2


async def test_falls_back_after_persistent_failure() -> None:
    ai = _StubAI(["garbage", "still garbage"])
    result = await generate_image_prompts(ai, _PERSONA)
    # 폴백은 fields 기반 결정적 프롬프트
    assert "환경공학" in result.portrait_prompt or "항공기술" in result.portrait_prompt
    assert ai.calls == 2  # 1 + 1 재시도 후 폴백


async def test_falls_back_on_banned_word() -> None:
    body = json.dumps({"portrait_prompt": "nsfw content", "background_prompt": "b"})
    ai = _StubAI([body, body])
    result = await generate_image_prompts(ai, _PERSONA)
    assert "nsfw" not in result.portrait_prompt.lower()
    assert ai.calls == 2  # 금칙어도 재시도를 소진한 뒤 폴백
