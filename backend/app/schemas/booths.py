"""booths 라우터용 Request/Response 모델."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _normalize_name(value: str) -> str:
    """앞뒤 공백을 떼고, 공백만 남으면 거부한다."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("부스 이름을 입력해주세요.")
    return stripped


def _normalize_description(value: str | None) -> str | None:
    """공백만 남은 설명은 없는 것으로 본다."""
    if value is None:
        return None
    return value.strip() or None


class BoothCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="부스 이름")
    description: str | None = Field(None, max_length=500, description="부스 설명(선택)")

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)


class BoothUpdateRequest(BaseModel):
    """부분 수정 — 보내지 않은 필드는 기존 값을 유지한다.

    description에 null을 명시하면 설명이 지워진다(서비스가 model_fields_set으로 구분).
    code는 인쇄물에 박혀 있어 변경할 수 없으므로 필드 자체를 두지 않는다.
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str | None) -> str | None:
        return None if value is None else _normalize_name(value)

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)


class BoothResponse(BaseModel):
    id: UUID
    code: str = Field(..., description="6자 부스 코드 — 발급 후 불변")
    name: str
    description: str | None = None
    qr_url: str = Field(..., description="QR에 담을 링크 (FRONTEND_ORIGIN 기준)")
    created_at: datetime


class BoothDeleteResponse(BaseModel):
    booth_id: UUID
