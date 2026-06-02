"""dev 라우터용 Request/Response 모델."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ImageTarget = Literal["id_photo", "card_background"]


class GenerateImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    target: ImageTarget = Field(
        ...,
        description=(
            "id_photo: 증명사진(세로 2:3, 1024x1536). "
            "card_background: 카드 배경(가로 3:2, 1536x1024)."
        ),
    )
    size: str | None = Field(
        None, description="명시적 override (예: 1024x1024). 미지정 시 target 기본값"
    )


class GenerateImageResponse(BaseModel):
    image_base64: str = Field(..., description="PNG의 base64 인코딩")
    size_bytes: int
    elapsed_seconds: float
    model: str
    size: str
    target: ImageTarget
    prompt: str
