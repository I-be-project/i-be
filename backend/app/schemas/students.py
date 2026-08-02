"""학생 본인 페이지(GET /api/students/me) Response 모델."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class StudentInfo(BaseModel):
    """회원가입 때 입력한 학생 식별 정보. 비밀번호는 절대 포함하지 않는다."""

    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    gender: str | None = Field(
        None, description="성별 ('male' | 'female'). 과거 가입자는 null일 수 있음"
    )
    photo_url: str | None = Field(
        None, description="학생 사진 Presigned GET URL (만료 있음). 사진이 없으면 null"
    )


class UpdateProfileRequest(BaseModel):
    """PATCH /api/students/me — 학생이 직접 고칠 수 있는 필드만 받는다.

    로그인 식별 키(school/grade/class_no/student_no)와 비밀번호는 이 API로 바꿀 수 없다.
    """

    name: str | None = Field(None, min_length=1, max_length=50, description="이름")
    gender: Literal["male", "female"] | None = Field(None, description="성별 (male=남, female=여)")

    @model_validator(mode="after")
    def _at_least_one_field(self) -> UpdateProfileRequest:
        if self.name is None and self.gender is None:
            raise ValueError("name 또는 gender 중 최소 하나는 입력해야 합니다.")
        return self


class PersonaSummary(BaseModel):
    """프로필에 표시할 페르소나 요약 (app/schemas/persona.py Persona와 필드 정렬)."""

    name: str
    tagline: str = ""
    keywords: list[str] = Field(default_factory=list)
    fields: list[str] = Field(default_factory=list)


class CardSummary(BaseModel):
    """발급된 카드 요약. 이미지가 아직 없으면 상위에서 card 자체를 null로 내린다."""

    card_image_url: str | None = Field(
        None, description="카드 이미지 Presigned GET URL (만료 있음). 키가 없으면 null"
    )


class ProfileBoothStatus(BaseModel):
    """프로필 화면의 부스 참여 현황 — 부스 탭/성향 탭이 함께 쓴다."""

    id: UUID
    name: str
    visited: bool = Field(..., description="이 학생이 이 부스에 방문 기록을 남겼는지")


class ProfileSummary(BaseModel):
    """프로필 화면 상태.

    has_completed: 가장 최근 세션이 completed 인지.
    retry_enabled: 행사 전역 '다시 하기' 스위치(ops.settings.retry_enabled).
    persona/card: 완료 시에만 채워지고, 없으면 null.
    booths: 전체 부스 목록 + 이 학생의 방문 여부. 설문 완료 여부와 무관하게 항상 채운다.
    """

    has_completed: bool
    retry_enabled: bool
    student: StudentInfo | None = None
    persona: PersonaSummary | None = None
    card: CardSummary | None = None
    booths: list[ProfileBoothStatus] = Field(default_factory=list)
