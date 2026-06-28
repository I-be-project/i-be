"""/api/admin — 관리자 대시보드·통계·운영자 관리."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminServiceDep, CurrentAdminDep
from app.schemas.admin import AdminLoginRequest, AdminLoginResponse, AdminStudentList

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def login(req: AdminLoginRequest, admin: AdminServiceDep) -> AdminLoginResponse:
    """관리자 단일 계정 로그인 → admin 세션 토큰 발급."""
    return AdminLoginResponse(admin_token=admin.authenticate(req.username, req.password))


@router.get("/students", response_model=AdminStudentList)
async def list_students(
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
    q: str | None = None,
    school: str | None = None,
    grade: int | None = None,
    class_no: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminStudentList:
    """가입한 모든 학생 목록 — 검색/필터/페이지네이션, 사진 presigned URL 포함."""
    return await admin.list_students(
        q=q, school=school, grade=grade, class_no=class_no, limit=limit, offset=offset
    )


@router.get("/dashboard")
async def dashboard() -> dict[str, object]:
    """실시간 발급 수, 부스별 체험 현황 등."""
    raise NotImplementedError


@router.get("/stats/keywords")
async def keyword_stats() -> dict[str, object]:
    """인기 키워드 통계."""
    raise NotImplementedError


@router.get("/operators")
async def list_operators() -> list[dict[str, object]]:
    raise NotImplementedError
