"""admin 라우터용 Request/Response 모델."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    admin_token: str = Field(..., description="관리자 세션 JWT (Bearer)")


class AdminStudentItem(BaseModel):
    id: UUID
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    password: str = Field(..., description="평문 비밀번호 — 관리자 전용 노출")
    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")
    consent_privacy: bool
    created_at: datetime


class AdminStudentList(BaseModel):
    total: int
    items: list[AdminStudentItem]
