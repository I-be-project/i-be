"""/api/auth — 학생 등록·로그인·세션 발급.

식별 키 (school, grade, class_no, student_no) + 비밀번호로 가입/인증한다.
사진 업로드는 별도 인증 엔드포인트(POST /api/students/me/photo)로 분리.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AuthServiceDep, CurrentStudentDep
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest, auth: AuthServiceDep) -> RegisterResponse:
    """학생 등록(학교/학년/반/번호/이름/비밀번호 + 개인정보 동의) → 학생 세션 토큰 발급.

    사진은 가입 후 별도 엔드포인트로 올린다(photo_key는 처음엔 비어 있음).
    """
    student, token = await auth.register_student(req)
    return RegisterResponse(student_id=student.id, student_token=token)


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, auth: AuthServiceDep) -> LoginResponse:
    """식별 키 + 비밀번호 인증 → 학생 세션 토큰 발급."""
    student, token = await auth.login(req)
    return LoginResponse(student_id=student.id, student_token=token)


@router.post("/refresh", response_model=LoginResponse)
async def refresh(student_id: CurrentStudentDep, auth: AuthServiceDep) -> LoginResponse:
    """유효한 학생 토큰을 새 만료시간으로 재발급."""
    return LoginResponse(student_id=student_id, student_token=auth.refresh_token(student_id))
