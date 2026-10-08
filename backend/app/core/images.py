"""이미지 바이트 검증·식별 헬퍼.

생성된 이미지가 실제로 디코드 가능한 유효 이미지인지, 어떤 포맷·크기인지
Pillow로 확인한다. 어댑터/서비스가 외부 응답을 신뢰하기 전에 통과시키는 게이트.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError

# 아이폰 사진(HEIC)을 Pillow가 열 수 있게 한다. 확장자만 .webp로 올라온 HEIC도 있다.
# Windows에서 네이티브 DLL이 정책으로 차단돼도 JPG·PNG 처리는 사용할 수 있다.
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except (ImportError, OSError):
    if os.name != "nt":
        raise
    logging.getLogger(__name__).warning(
        "HEIC 지원을 불러오지 못했습니다. 이 Windows 환경에서는 JPG·PNG·WebP 사진을 사용하세요."
    )

# codex가 그대로 받는 입력 포맷. 그 밖(HEIC 등)은 JPEG로 바꿔 넘긴다.
_CODEX_FORMATS = {"JPEG", "PNG", "WEBP"}


class ImageValidationError(ValueError):
    """바이트가 유효한 이미지가 아니거나 기준 미달일 때."""


@dataclass(frozen=True)
class ImageInfo:
    content_type: str
    image_format: str
    width: int
    height: int


def inspect_image(data: bytes, *, min_bytes: int = 100) -> ImageInfo:
    """이미지 바이트를 검증하고 메타데이터를 반환.

    - 디코드 불가/손상/미지원 포맷이면 ImageValidationError.
    - min_bytes 미만이면 (빈 응답·오류 페이지 등) ImageValidationError.
    """
    if len(data) < min_bytes:
        raise ImageValidationError(f"이미지가 너무 작습니다: {len(data)} bytes (최소 {min_bytes})")

    try:
        # 1차: 무결성 검증 (truncation 등 탐지)
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        # verify() 후에는 이미지 사용 불가 → 크기·포맷은 새로 연다.
        with Image.open(BytesIO(data)) as img:
            image_format = img.format or "UNKNOWN"
            width, height = img.size
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ImageValidationError(f"유효한 이미지가 아닙니다: {exc}") from exc

    content_type = Image.MIME.get(image_format, "application/octet-stream")
    return ImageInfo(
        content_type=content_type,
        image_format=image_format,
        width=width,
        height=height,
    )


def to_codex_input(data: bytes) -> bytes:
    """JPEG·PNG·WebP는 그대로, 그 밖(HEIC 등)은 JPEG로 바꾼다.

    판별할 수 없는 바이트는 그대로 둔다 — codex 어댑터가 같은 검증으로 사유를 남긴다.
    """
    try:
        if inspect_image(data).image_format in _CODEX_FORMATS:
            return data
    except ImageValidationError:
        return data
    with Image.open(BytesIO(data)) as im:
        out = BytesIO()
        im.convert("RGB").save(out, format="JPEG", quality=95)
    return out.getvalue()


def crop_top(data: bytes, ratio: float) -> bytes:
    """폭 유지, 위를 기준으로 세로를 잘라 폭/높이 = ratio로 맞춘 PNG. 이미 더 넓으면 좌우를 자른다.

    생성 모델이 요청한 비율과 다르게 줘도(예: 2:3) 저장본 비율을 고정하려는 용도.
    머리 위 여백이 구도의 기준이라 위를 남기고 아래(가슴)를 버린다.
    """
    with Image.open(BytesIO(data)) as im:
        w, h = im.size
        if w / h > ratio:  # 가로로 넓다 → 좌우 가운데 기준
            nw = round(h * ratio)
            box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
        else:
            box = (0, 0, w, round(w / ratio))
        out = BytesIO()
        im.crop(box).save(out, format="PNG")
    return out.getvalue()
