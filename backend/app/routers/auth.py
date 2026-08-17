"""/api/auth — 학생 등록·로그인·세션 발급.

학교 소속은 식별 키 (school, grade, class_no, student_no) + 비밀번호로, 학교 없는
개인 참여자는 name + 비밀번호로 가입/인증한다(둘 다 RegisterRequest/LoginRequest 하나로
받고 학교 필드 유무로 분기). 사진 업로드는 별도 인증 엔드포인트
(POST /api/students/me/photo)로 분리.
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
    """학생 등록 → 학생 세션 토큰 발급.

    학교 4개 필드(학교/학년/반/번호)를 모두 보내면 학교 소속 학생, 모두 생략하면
    학교 없는 개인 참여자(kind='guest')로 가입한다. 이름/비밀번호/성별/개인정보 동의는
    공통이다. 사진은 가입 후 별도 엔드포인트로 올린다(photo_key는 처음엔 비어 있음).
    """
    student, token = await auth.register_student(
        school=req.school,
        grade=req.grade,
        class_no=req.class_no,
        student_no=req.student_no,
        name=req.name,
        password=req.password,
        gender=req.gender,
        consent_privacy=req.consent_privacy,
        birth_date=req.birth_date,
    )
    return RegisterResponse(student_id=student.id, student_token=token)


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, auth: AuthServiceDep) -> LoginResponse:
    """식별 키(학교 소속) 또는 이름(개인 참여자) + 비밀번호 인증 → 학생 세션 토큰 발급.

    이름 로그인은 kind='guest'만 조회한다 — 테스트 계정(kind='test')은 이 경로로
    들어올 수 없다.
    """
    student, token = await auth.login(
        school=req.school,
        grade=req.grade,
        class_no=req.class_no,
        student_no=req.student_no,
        name=req.name,
        password=req.password,
    )
    return LoginResponse(student_id=student.id, student_token=token)


@router.post("/refresh", response_model=LoginResponse)
async def refresh(student_id: CurrentStudentDep, auth: AuthServiceDep) -> LoginResponse:
    """유효한 학생 토큰을 새 만료시간으로 재발급."""
    return LoginResponse(student_id=student_id, student_token=auth.refresh_token(student_id))
