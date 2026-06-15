"""core.images.inspect_image 검증 테스트."""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from app.core.images import ImageValidationError, inspect_image


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
