"""admin 라우터용 Request/Response 모델."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.students import PersonaSummary


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    admin_token: str = Field(..., description="관리자 세션 JWT (Bearer)")


class AdminStudentProgress(BaseModel):
    """학생의 설문 진행도 요약 — 가장 최근 세션 기준.

    status: 세션이 아예 없으면 not_started, 최근 세션이 in_progress/completed면 그대로.
    stages_done: 최근 세션에 저장된 answer 단계(q1to6/q7a/q7b/q8/q9).
    """

    status: Literal["not_started", "in_progress", "completed"] = "not_started"
    stages_done: list[str] = Field(default_factory=list)
    has_persona: bool = False
    has_card: bool = False
    last_activity_at: datetime | None = None


class AdminStudentItem(BaseModel):
    id: UUID
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    password: str = Field(..., description="평문 비밀번호 — 관리자 전용 노출")
    gender: str | None = Field(None, description="성별 ('male' | 'female', 없으면 null)")
    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")
    has_photo: bool = Field(
        False,
        description="사진 보유 여부. include_photo=false여서 photo_url이 null이어도 유무를 알 수 있다.",
    )
    consent_privacy: bool
    created_at: datetime
    progress: AdminStudentProgress = Field(default_factory=AdminStudentProgress)


AdminStudentSort = Literal["created_desc", "created_asc", "name_asc"]


class AdminStudentList(BaseModel):
    total: int
    items: list[AdminStudentItem]


class AdminAnswer(BaseModel):
    """세션에 저장된 단계별 답변 1건."""

    stage: str
    payload: dict[str, Any]
    created_at: datetime


class AdminSessionDetail(BaseModel):
    """한 세션(설문 1회 시도)의 전체 내용 — 답변·페르소나·카드."""

    id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None
    answers: list[AdminAnswer]
    persona: PersonaSummary | None = None
    card_image_url: str | None = Field(
        None, description="카드 이미지 presigned URL (없으면 null)"
    )


class AdminStudentDetail(BaseModel):
    """관리자 상세 조회 — 학생 기본 정보 + 모든 세션(최신순) 내용."""

    id: UUID
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    password: str = Field(..., description="평문 비밀번호 — 관리자 전용 노출")
    gender: str | None = Field(None, description="성별 ('male' | 'female', 없으면 null)")
    photo_url: str | None = None
    consent_privacy: bool
    created_at: datetime
    sessions: list[AdminSessionDetail] = Field(default_factory=list)


class AdminStudentPhoto(BaseModel):
    """학생 사진 presigned URL 단건 — 목록에서 사진을 뺀 뒤 필요할 때만 받는다."""

    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")


class AdminDeleteResponse(BaseModel):
    """유저 하드 삭제 결과."""

    student_id: UUID
    removed_storage_objects: int = Field(
        0, description="S3에서 실제로 삭제된 객체 수(사진 + 카드 이미지)"
    )


class AdminBulkDeleteRequest(BaseModel):
    """여러 학생을 한 번에 삭제."""

    ids: list[UUID] = Field(..., min_length=1, max_length=500)


class AdminBulkDeleteResponse(BaseModel):
    """일괄 삭제 결과 — 삭제된 id, 이미 없던 id, S3 삭제 객체 수."""

    deleted: list[UUID]
    not_found: list[UUID]
    removed_storage_objects: int = 0
