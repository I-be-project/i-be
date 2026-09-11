"""booths·student_booths 라우터용 Request/Response 모델.

관리자용(BoothCreateRequest 등)과 학생용(StudentBoothResponse 등)을 한 파일에 둔다.
같은 ops.booths를 서로 다른 시야로 내보내는 것이라 함께 두는 편이 차이를 보기 쉽다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# 존 4개 — F/L/Y는 직업체험, C는 역량체험. 존을 모르는 부스는 ''.
BoothZone = Literal["F", "L", "Y", "C", ""]


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
    zone: BoothZone = Field("", description="F·L·Y·C 중 하나. 생략하면 빈 값")

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
    name은 비워둘 수 없는 값이라 명시적 null(예: {"name": null})은 검증 단계에서 거부한다
    (Pydantic v2는 필드를 아예 안 보내면 field_validator를 건너뛰지만, 명시적 null에는 실행한다).
    code는 인쇄물에 박혀 있어 변경할 수 없으므로 필드 자체를 두지 않는다.
    zone에 null을 명시하면 검증에서 거부된다(빈 값으로 지우려면 ''를 보낸다).
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    zone: BoothZone | None = Field(None, description="보내지 않으면 기존 값 유지")

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("부스 이름은 비울 수 없어요.")
        return _normalize_name(value)

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)

    @field_validator("zone")
    @classmethod
    def _check_zone(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("존은 비울 수 없어요. 지우려면 빈 문자열을 보내주세요.")
        return value


class BoothResponse(BaseModel):
    id: UUID
    code: str = Field(..., description="6자 부스 코드 — 발급 후 불변")
    name: str
    description: str | None = None
    zone: BoothZone = ""
    qr_url: str = Field(..., description="QR에 담을 링크 (FRONTEND_ORIGIN 기준)")
    created_at: datetime


class BoothDeleteResponse(BaseModel):
    booth_id: UUID


class StudentBoothResponse(BaseModel):
    """학생이 QR을 찍고 들어왔을 때 보여줄 부스 정보.

    id·qr_url은 내려주지 않는다. 학생 화면에 쓸 데가 없고, 관리자용 식별자를
    학생 응답에 섞지 않는 편이 낫다.
    """

    code: str
    name: str
    description: str | None = None
    visited: bool = Field(..., description="이 학생이 이미 방문 기록을 남겼는지")
    visited_at: datetime | None = Field(
        None, description="첫 방문 기록 시각 (visited=false면 null)"
    )


class BoothVisitResponse(BaseModel):
    """방문 기록 결과."""

    code: str
    name: str
    visited_at: datetime = Field(..., description="첫 방문 기록 시각 — 재방문해도 덮이지 않는다")
    already_visited: bool = Field(
        ..., description="이번 요청 전에 이미 기록이 있었으면 true (에러가 아니다)"
    )


class BoothVisitStat(BaseModel):
    """부스 1개의 방문 집계."""

    booth_id: UUID
    code: str
    name: str
    visit_count: int = Field(..., description="이 부스를 찍은 학생 수")


class BoothStatsResponse(BaseModel):
    """부스별 참여인원 — 관리자·운영진 공통 조회."""

    booths: list[BoothVisitStat]
    total_visits: int = Field(..., description="연인원 — 부스별 방문 수의 합")
    unique_students: int = Field(..., description="실인원 — 부스를 하나라도 찍은 학생 수")
