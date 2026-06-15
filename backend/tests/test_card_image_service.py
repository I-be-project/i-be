"""card_image_service 병렬 생성·실패 처리 테스트."""

from __future__ import annotations

import pytest

from app.adapters.ai_client import AIPurpose
from app.core.errors import ExternalServiceError
from app.services.card_image_service import (
    BACKGROUND_SIZE,
    PORTRAIT_SIZE,
    generate_card_images,
)


class _StubAI:
    def __init__(self, fail_on: AIPurpose | None = None) -> None:
        self.fail_on = fail_on
        self.calls: list[tuple[AIPurpose, str | None]] = []

    async def generate_image(
        self, purpose: AIPurpose, prompt: str, *, size: str | None = None, n: int = 1
    ) -> bytes:
        self.calls.append((purpose, size))
        if self.fail_on is not None and purpose == self.fail_on:
            raise ExternalServiceError("이미지 생성 실패")
        return b"\x89PNG-stub-" + purpose.encode()


async def test_parallel_success_requests_both_sizes() -> None:
    ai = _StubAI()
    result = await generate_card_images(ai, portrait_prompt="p", background_prompt="b")

    assert result.portrait.startswith(b"\x89PNG")
    assert result.background.startswith(b"\x89PNG")
    sizes = {size for _, size in ai.calls}
    assert PORTRAIT_SIZE in sizes
    assert BACKGROUND_SIZE in sizes


async def test_one_failure_fails_whole_card() -> None:
    ai = _StubAI(fail_on=AIPurpose.PORTRAIT_IMAGE)
    with pytest.raises(ExternalServiceError) as exc:
        await generate_card_images(ai, portrait_prompt="p", background_prompt="b")
    assert "portrait" in exc.value.details["failed"]
    assert "background" not in exc.value.details["failed"]
