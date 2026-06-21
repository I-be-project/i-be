"""dev 라우터용 Request/Response 모델."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.persona import Persona

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


class GenerateCardRequest(BaseModel):
    """질문이 끝났다고 가정 — 준비된 프롬프트·페르소나로 완성 카드를 생성."""

    portrait_prompt: str = Field(
        ..., min_length=1, max_length=4000, description="인물 그림 설명(영문 권장)"
    )
    background_prompt: str = Field(
        ..., min_length=1, max_length=4000, description="배경 그림 설명(영문 권장)"
    )
    title: str = Field(..., min_length=1, max_length=60, description="페르소나 타이틀")
    tagline: str = Field("", max_length=160, description="한 줄 소개 (선택)")
    keywords: list[str] = Field(default_factory=list, max_length=8, description="키워드 3~5개 권장")
    qr_data: str = Field(
        "https://nabe.example/c/demo",
        max_length=512,
        description="QR에 인코딩할 문자열(공유 링크/토큰). dev에선 임의값.",
    )


class GenerateCardResponse(BaseModel):
    image_base64: str = Field(..., description="완성 카드 PNG의 base64 인코딩")
    size_bytes: int
    width: int
    height: int
    elapsed_seconds: float


class GeneratePersonaCardRequest(BaseModel):
    """선택된 (mock) 페르소나로 실제 카드 생성."""

    persona: Persona
    photo_base64: str | None = Field(
        None, description="증명사진 PNG/JPEG의 base64. 없으면 text→image."
    )
    qr_data: str = Field(
        "https://nabe.example/c/demo", max_length=512, description="QR에 인코딩할 문자열."
    )


class GeneratePersonaCardResponse(BaseModel):
    persona: Persona
    card_base64: str = Field(..., description="완성 카드 PNG의 base64")
    portrait_prompt: str
    background_prompt: str
    elapsed_seconds: float
