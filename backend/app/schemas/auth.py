"""auth 라우터용 Request/Response 모델.

식별 키: (school, grade, class_no, student_no).
비밀번호는 단순 문자열(프론트가 생년월일 형식으로 안내할 뿐, 백엔드는 의미를 모름)이라
형식 검증을 두지 않는다.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

# 식별 키 구성요소의 공통 제약 — Request 간 재사용.
# 학교 없는 계정(개인 참여자)을 받기 위해 전부 optional이며, 조합은 validator가 강제한다.
_GRADE = Field(None, ge=1, le=12, description="학년 (학교 소속만)")
_CLASS_NO = Field(None, ge=1, le=99, description="반 (학교 소속만)")
_STUDENT_NO = Field(None, ge=1, le=99, description="번호 (학교 소속만)")
_SCHOOL = Field(None, min_length=1, max_length=100, description="학교명 (학교 소속만)")
_PASSWORD = Field(..., min_length=1, max_length=128, description="비밀번호(단순 문자열)")


def _school_field_state(
    school: str | None, grade: int | None, class_no: int | None, student_no: int | None
) -> bool:
    """학교 4개 필드가 전부 있으면 True, 전부 없으면 False. 일부만 있으면 ValueError."""
    fields = (school, grade, class_no, student_no)
    present = [f is not None for f in fields]
    if all(present):
        return True
    if not any(present):
        return False
    raise ValueError("학교·학년·반·번호는 모두 함께 보내거나 모두 생략해야 합니다.")


class RegisterRequest(BaseModel):
    school: str | None = _SCHOOL
    grade: int | None = _GRADE
    class_no: int | None = _CLASS_NO
    student_no: int | None = _STUDENT_NO
    name: str = Field(..., min_length=1, max_length=50, description="이름")
    password: str = _PASSWORD
    gender: Literal["male", "female"] = Field(..., description="성별 (male=남, female=여)")
    consent_privacy: bool = Field(
        ..., description="개인정보 수집·이용 동의 (가입 필수, false면 거부됨)"
    )

    @model_validator(mode="after")
    def _school_fields_all_or_none(self) -> RegisterRequest:
        """학교 필드를 전부 보내면 학교 소속, 전부 생략하면 개인 참여자로 가입한다."""
        _school_field_state(self.school, self.grade, self.class_no, self.student_no)
        return self


class RegisterResponse(BaseModel):
    student_id: UUID
    student_token: str = Field(..., description="학생 세션 JWT (Bearer)")


class LoginRequest(BaseModel):
    school: str | None = _SCHOOL
    grade: int | None = _GRADE
    class_no: int | None = _CLASS_NO
    student_no: int | None = _STUDENT_NO
    name: str | None = Field(None, min_length=1, max_length=50, description="이름 (개인 참여자만)")
    password: str = _PASSWORD

    @model_validator(mode="after")
    def _exactly_one_identity(self) -> LoginRequest:
        """학교 식별 키 또는 이름 중 정확히 하나로만 로그인한다."""
        has_school = _school_field_state(self.school, self.grade, self.class_no, self.student_no)
        if has_school == (self.name is not None):
            raise ValueError("학교 식별 정보 또는 이름 중 하나만 보내야 합니다.")
        return self


class LoginResponse(BaseModel):
    student_id: UUID
    student_token: str = Field(..., description="학생 세션 JWT (Bearer)")


class PhotoUploadResponse(BaseModel):
    photo_key: str = Field(..., description="Storage에 저장된 사진 경로(키)")
