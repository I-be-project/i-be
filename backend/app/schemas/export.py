"""/api/export/v1 응답 — 외부 시스템 전달 계약. 필드를 바꾸면 v2로 올린다."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.admin import AdminQuestionAnswer, AdminStageAnswer


class ExportSurvey(BaseModel):
    """대표 세션 1개 — 완료 세션 중 최신, 없으면 가장 최근 세션."""

    session_id: UUID
    status: str = Field(..., description="completed | in_progress | abandoned")
    started_at: datetime
    completed_at: datetime | None
    riasec: dict[str, int] | None = Field(None, description="Q1~Q6 완료 전이면 null")
    pair_code: str | None
    answers: list[AdminQuestionAnswer | AdminStageAnswer]


class ExportPersona(BaseModel):
    """검수 승인된 확정본. 승인 전이면 persona 자체가 null."""

    name: str = Field(..., description="persona_name 전체 (headline + base_career)")
    headline: str = Field(..., description="수식어")
    base_career: str = Field(..., description="직업명")
    tagline: str = Field(..., description="한 줄 설명")
    competencies: list[str] = Field(..., description="필요 역량 3개")
    image_url: str | None = Field(
        None, description="AI 생성 인물 이미지 (1시간 만료). null이면 생성 실패로 기본 캐릭터 사용"
    )
    approved_at: datetime


class ExportStudent(BaseModel):
    id: UUID
    kind: str = Field(..., description="student(학교 소속) | guest(개인 참여자)")
    school: str = Field(..., description="개인 참여자는 ''")
    grade: int = Field(..., description="개인 참여자는 0")
    class_no: int = Field(..., description="개인 참여자는 0")
    student_no: int = Field(..., description="개인 참여자는 0")
    name: str
    gender: Literal["male", "female"]
    birth_date: str | None = Field(None, description="YYYYMMDD")
    consent_privacy: bool
    created_at: datetime
    photo_url: str | None = Field(None, description="원본 사진 (1시간 만료). 없으면 null")
    survey: ExportSurvey | None = Field(None, description="설문을 시작하지 않았으면 null")
    persona: ExportPersona | None = Field(None, description="승인된 결과가 없으면 null")


class ExportPage(BaseModel):
    items: list[ExportStudent]
    next_cursor: UUID | None = Field(None, description="다음 페이지 cursor. null이면 마지막 페이지")
