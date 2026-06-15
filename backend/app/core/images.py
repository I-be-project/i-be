"""이미지 바이트 검증·식별 헬퍼.

생성된 이미지가 실제로 디코드 가능한 유효 이미지인지, 어떤 포맷·크기인지
Pillow로 확인한다. 어댑터/서비스가 외부 응답을 신뢰하기 전에 통과시키는 게이트.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError


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
