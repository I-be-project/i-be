"""auth 라우터용 Request/Response 모델.

식별 키: (school, grade, class_no, student_no).
비밀번호는 단순 문자열(프론트가 생년월일 형식으로 안내할 뿐, 백엔드는 의미를 모름)이라
형식 검증을 두지 않는다.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

# 식별 키 구성요소의 공통 제약 — Request 간 재사용.
_GRADE = Field(..., ge=1, le=12, description="학년")
_CLASS_NO = Field(..., ge=1, le=99, description="반")
_STUDENT_NO = Field(..., ge=1, le=99, description="번호")
_SCHOOL = Field(..., min_length=1, max_length=100, description="학교명")
_PASSWORD = Field(..., min_length=1, max_length=128, description="비밀번호(단순 문자열)")


class RegisterRequest(BaseModel):
    school: str = _SCHOOL
    grade: int = _GRADE
    class_no: int = _CLASS_NO
    student_no: int = _STUDENT_NO
    name: str = Field(..., min_length=1, max_length=50, description="이름")
    password: str = _PASSWORD
    consent_privacy: bool = Field(
        ..., description="개인정보 수집·이용 동의 (가입 필수, false면 거부됨)"
    )


class RegisterResponse(BaseModel):
    student_id: UUID
    student_token: str = Field(..., description="학생 세션 JWT (Bearer)")


class LoginRequest(BaseModel):
    school: str = _SCHOOL
    grade: int = _GRADE
    class_no: int = _CLASS_NO
    student_no: int = _STUDENT_NO
    password: str = _PASSWORD


class LoginResponse(BaseModel):
    student_id: UUID
    student_token: str = Field(..., description="학생 세션 JWT (Bearer)")


class PhotoUploadResponse(BaseModel):
    photo_key: str = Field(..., description="Storage에 저장된 사진 경로(키)")
