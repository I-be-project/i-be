"""학생 본인 페이지(GET /api/students/me) Response 모델."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StudentInfo(BaseModel):
    """회원가입 때 입력한 학생 식별 정보. 비밀번호는 절대 포함하지 않는다."""

    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    photo_url: str | None = Field(
        None, description="학생 사진 Presigned GET URL (만료 있음). 사진이 없으면 null"
    )


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


class ProfileSummary(BaseModel):
    """프로필 화면 상태.

    has_completed: 가장 최근 세션이 completed 인지.
    retry_enabled: 행사 전역 '다시 하기' 스위치(ops.settings.retry_enabled).
    persona/card: 완료 시에만 채워지고, 없으면 null.
    """

    has_completed: bool
    retry_enabled: bool
    student: StudentInfo | None = None
    persona: PersonaSummary | None = None
    card: CardSummary | None = None
