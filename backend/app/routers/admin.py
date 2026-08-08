"""/api/admin — 관리자 대시보드·통계·운영자 관리."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.deps import AdminServiceDep, CurrentAdminDep
from app.schemas.admin import (
    AdminBulkDeleteRequest,
    AdminBulkDeleteResponse,
    AdminClassProgress,
    AdminDeleteResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminStudentDetail,
    AdminStudentKind,
    AdminStudentList,
    AdminStudentPhoto,
    AdminStudentSort,
    AdminTestPurgeResponse,
    AdminTestStudent,
    AdminTestStudentCreateRequest,
    AdminTestToken,
)

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
    sort: AdminStudentSort | None = None,
    include_photo: bool = True,
    kind: AdminStudentKind | None = None,
) -> AdminStudentList:
    """가입한 참가자 목록 — 검색/필터/정렬/페이지네이션, 사진 presigned URL 포함.

    include_photo=false면 사진 서명을 건너뛰어 훨씬 빠르다(사진이 필요 없는 관리자 UI용).
    기본값 true는 외부 공개 계약이므로 바꾸지 않는다.

    kind를 생략하면 실제 참가자(student·guest)만 나오고 테스트 계정은 빠진다.
    kind=test면 테스트 계정만 나온다 — 관리자 화면의 '테스트 계정' 탭이 이 경로를 쓴다.
    """
    return await admin.list_students(
        q=q,
        school=school,
        grade=grade,
        class_no=class_no,
        limit=limit,
        offset=offset,
        sort=sort,
        include_photo=include_photo,
        kind=kind,
    )


# 주의: 아래 정적 경로는 /students/{student_id}보다 먼저 선언해야 한다.
# (그렇지 않으면 "schools"가 UUID 경로 파라미터로 매칭되어 422가 난다.)
@router.get("/students/schools", response_model=list[str])
async def list_schools(
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> list[str]:
    """학교 필터 드롭다운용 — 가입 학생이 있는 학교 이름 목록(가나다순)."""
    return await admin.list_schools()


@router.post("/students/bulk-delete", response_model=AdminBulkDeleteResponse)
async def bulk_delete_students(
    req: AdminBulkDeleteRequest,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminBulkDeleteResponse:
    """여러 학생을 한 번에 하드 삭제(DB cascade + S3 사진/카드 이미지)."""
    return await admin.delete_students(req.ids)


# 주의: 아래 /students/test 계열은 /students/{student_id}보다 먼저 선언해야 한다.
# (그렇지 않으면 "test"가 UUID 경로 파라미터로 매칭되어 422가 난다.)
@router.post("/students/test", response_model=AdminTestStudent, status_code=201)
async def create_test_student(
    req: AdminTestStudentCreateRequest,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestStudent:
    """테스트 계정 발급 — 관리자 화면에서만 만들 수 있고 학생 로그인 화면엔 노출되지 않는다."""
    return await admin.create_test_student(name=req.name, gender=req.gender)


@router.post("/students/test/{student_id}/token", response_model=AdminTestToken)
async def issue_test_student_token(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestToken:
    """테스트 계정으로 학생 화면에 진입할 학생 세션 토큰 발급."""
    return await admin.issue_test_student_token(student_id)


@router.delete("/students/test", response_model=AdminTestPurgeResponse)
async def purge_test_students(
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestPurgeResponse:
    """테스트 계정 전부 삭제 — DB cascade + S3 사진/카드 이미지."""
    return await admin.purge_test_students()


@router.get("/progress/classes", response_model=list[AdminClassProgress])
async def class_progress(
    school: str,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> list[AdminClassProgress]:
    """학교의 반별 진행 현황 집계 — 좌석표의 학년·반 선택과 완료 배지용.

    학생 개인정보를 내려보내지 않고 (학년, 반)별 카운트만 반환한다.
    """
    return await admin.get_class_progress(school)


@router.get("/students/{student_id}", response_model=AdminStudentDetail)
async def student_detail(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminStudentDetail:
    """학생 1명 상세 — 설문 진행 단계별 답변·페르소나·카드 결과."""
    return await admin.get_student_detail(student_id)


@router.get("/students/{student_id}/photo-url", response_model=AdminStudentPhoto)
async def student_photo_url(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminStudentPhoto:
    """학생 사진 presigned URL 1건 — 목록에서 사진을 뺀 화면이 필요할 때만 호출한다."""
    return await admin.get_student_photo_url(student_id)


@router.delete("/students/{student_id}", response_model=AdminDeleteResponse)
async def delete_student(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminDeleteResponse:
    """학생 하드 삭제 — DB(세션·답변·페르소나·카드 cascade) + S3 사진/카드 이미지."""
    return await admin.delete_student(student_id)


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
