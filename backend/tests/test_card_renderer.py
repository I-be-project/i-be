"""card_renderer 합성 테스트 — 더미 그림 2장 → 완성 카드 PNG."""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from app.core.images import inspect_image
from app.services.card_renderer import (
    CARD_H,
    CARD_W,
    PersonaCardContent,
    _build_qr,
    render_card,
)


def _png(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_render_card_produces_valid_png() -> None:
    background = _png((1536, 1024), (30, 40, 55))
    portrait = _png((1024, 1536), (90, 90, 160))
    content = PersonaCardContent(
        title="숲을 지키는 드론 전문가",
        tagline="자연과 기술을 함께 활용해 생태를 지키는 미래형 탐사 역할",
        keywords=["자연", "드론", "탐사", "기술", "보호"],
    )

    out = render_card(background, portrait, content, "https://ibe.example/c/abc123")

    info = inspect_image(out)
    assert info.image_format == "PNG"
    assert info.width == CARD_W
    assert info.height == CARD_H
    assert len(out) > 5000


def test_render_card_handles_long_title_without_error() -> None:
    background = _png((1536, 1024), (10, 10, 10))
    portrait = _png((1024, 1536), (200, 200, 200))
    content = PersonaCardContent(
        title="아주아주아주 긴 페르소나 타이틀 자동 줄바꿈 테스트를 위한 문자열입니다",
        keywords=["a", "b"],
    )
    out = render_card(background, portrait, content, "x")
    assert inspect_image(out).width == CARD_W


def test_render_card_minimal_content() -> None:
    background = _png((1536, 1024), (50, 60, 70))
    portrait = _png((1024, 1536), (120, 80, 80))
    content = PersonaCardContent(title="탐험가")
    out = render_card(background, portrait, content, "y")
    assert inspect_image(out).image_format == "PNG"


def test_build_qr_returns_square_image() -> None:
    img = _build_qr("https://ibe.example/c/abc", 200)
    assert img.size == (200, 200)
