"""core.images.inspect_image 검증 테스트."""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from app.core.images import ImageValidationError, crop_top, inspect_image


def _png(size: tuple[int, int] = (64, 64), color: tuple[int, int, int] = (10, 20, 30)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_inspect_valid_png() -> None:
    info = inspect_image(_png((120, 80)))
    assert info.image_format == "PNG"
    assert (info.width, info.height) == (120, 80)
    assert info.content_type == "image/png"


def test_inspect_valid_jpeg() -> None:
    buf = BytesIO()
    Image.new("RGB", (40, 30), (200, 100, 50)).save(buf, format="JPEG")
    info = inspect_image(buf.getvalue())
    assert info.image_format == "JPEG"
    assert (info.width, info.height) == (40, 30)


def test_inspect_rejects_garbage() -> None:
    with pytest.raises(ImageValidationError):
        inspect_image(b"this is definitely not an image payload" * 5)


def test_inspect_rejects_too_small() -> None:
    with pytest.raises(ImageValidationError):
        inspect_image(b"\x89PNG")


def test_crop_top_keeps_top_of_tall_image() -> None:
    """2:3 → 4:5: 위(머리 여백)를 남기고 아래를 자른다."""
    im = Image.new("RGB", (100, 150), (0, 0, 0))
    im.paste((255, 0, 0), (0, 0, 100, 10))  # 맨 위 띠
    buf = BytesIO()
    im.save(buf, format="PNG")

    out = Image.open(BytesIO(crop_top(buf.getvalue(), 4 / 5)))

    assert out.size == (100, 125)
    assert out.getpixel((50, 0)) == (255, 0, 0)


def test_crop_top_trims_sides_of_wide_image() -> None:
    assert Image.open(BytesIO(crop_top(_png((100, 100)), 4 / 5))).size == (80, 100)
