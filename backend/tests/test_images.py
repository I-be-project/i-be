"""core.images.inspect_image 검증 테스트."""

from __future__ import annotations

import os
import runpy
import sys
from io import BytesIO
from types import ModuleType

import pytest
from PIL import Image

from app.core.images import ImageValidationError, crop_top, inspect_image, to_codex_input


@pytest.mark.skipif(os.name != "nt", reason="Windows DLL 차단 시 폴백")
def test_windows_blocked_heif_keeps_png_support(monkeypatch: pytest.MonkeyPatch) -> None:
    plugin = ModuleType("pillow_heif")

    def blocked() -> None:
        raise ImportError("DLL blocked by application control policy")

    monkeypatch.setattr(plugin, "register_heif_opener", blocked, raising=False)
    monkeypatch.setitem(sys.modules, "pillow_heif", plugin)
    namespace = runpy.run_module("app.core.images", run_name="heif_fallback_test", alter_sys=True)
    assert namespace["inspect_image"](_png((120, 80))).image_format == "PNG"


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


def _encode(fmt: str) -> bytes:
    out = BytesIO()
    Image.new("RGB", (64, 80), (120, 80, 40)).save(out, format=fmt)
    return out.getvalue()


@pytest.mark.skipif(
    os.name == "nt" and "HEIF" not in Image.SAVE, reason="Windows HEIC DLL 사용 불가"
)
def test_to_codex_input_converts_heic_to_jpeg() -> None:
    """확장자만 .webp인 아이폰 사진(HEIC)도 codex가 받는 JPEG로 바뀐다."""
    heic = _encode("HEIF")
    assert inspect_image(heic).image_format == "HEIF"

    out = to_codex_input(heic)
    info = inspect_image(out)
    assert (info.image_format, info.width, info.height) == ("JPEG", 64, 80)


def test_to_codex_input_keeps_supported_formats() -> None:
    jpeg = _encode("JPEG")
    assert to_codex_input(jpeg) is jpeg
