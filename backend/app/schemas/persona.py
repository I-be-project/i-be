"""페르소나·이미지 프롬프트 도메인 모델 (저장 무관, 파이프라인 입출력)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Persona(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    tagline: str = Field("", max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=8)
    fields: list[str] = Field(default_factory=list, max_length=8)


class ImagePrompts(BaseModel):
    portrait_prompt: str = Field(..., min_length=1, max_length=4000)
    background_prompt: str = Field(..., min_length=1, max_length=4000)
