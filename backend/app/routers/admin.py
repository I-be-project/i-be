"""/api/admin — 관리자 대시보드·통계·운영자 관리."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.errors import NotFoundError
from app.deps import (
    AdminServiceDep,
    CurrentAdminDep,
    CurrentStaffDep,
    DraftRepoDep,
    StorageClientDep,
)
from app.routers.dev import draft_items
from app.schemas.admin import (
    AdminBulkDeleteRequest,
    AdminBulkDeleteResponse,
    AdminClassProgress,
    AdminDeleteResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminReviewProgress,
    AdminStudentDetail,
    AdminStudentKind,
    AdminStudentList,
    AdminStudentPhoto,
    AdminStudentSort,
    AdminTestPurgeResponse,
    AdminTestStudent,
    AdminTestStudentCreateRequest,
    AdminTestToken,
    AdminVerdictRequest,
)
from app.schemas.dev import DraftItem

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def login(req: AdminLoginRequest, admin: AdminServiceDep) -> AdminLoginResponse:
    """관리자 단일 계정 로그인 → admin 세션 토큰 발급."""
    return AdminLoginResponse(admin_token=admin.authenticate(req.username, req.password))


@router.get("/students", response_model=AdminStudentList)
async def list_students(
    _staff: CurrentStaffDep,
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
    _staff: CurrentStaffDep,
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


@router.get("/students/test/{student_id}/profile")
async def get_test_student_profile(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> dict[str, str]:
    """학생 로그인 계정을 변경하지 않고 테스트 계정의 공개 페이지 주소 조회."""
    return {"path": await admin.get_test_profile_path(student_id)}


@router.get("/progress/classes", response_model=list[AdminClassProgress])
async def class_progress(
    school: str,
    _staff: CurrentStaffDep,
    admin: AdminServiceDep,
) -> list[AdminClassProgress]:
    """학교의 반별 진행 현황 집계 — 좌석표의 학년·반 선택과 완료 배지용.

    학생 개인정보를 내려보내지 않고 (학년, 반)별 카운트만 반환한다.
    """
    return await admin.get_class_progress(school)


@router.get("/students/{student_id}", response_model=AdminStudentDetail)
async def student_detail(
    student_id: UUID,
    role: CurrentStaffDep,
    admin: AdminServiceDep,
) -> AdminStudentDetail:
    """학생 1명 상세 — 설문 진행 단계별 답변·페르소나·카드 결과.

    운영진에게는 설문 답변 원문을 내려보내지 않는다(UI 숨김이 아니라 응답에서 제외).
    """
    return await admin.get_student_detail(student_id, include_answers=(role == "admin"))


@router.get("/students/{student_id}/photo-url", response_model=AdminStudentPhoto)
async def student_photo_url(
    student_id: UUID,
    _staff: CurrentStaffDep,
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


# 초안 평가(O/X/△) — 배포 환경에서 여러 명이 /dev/review 결과를 채점한다.
# 승인·재생성은 로컬 codex가 필요해 /dev/review에만 있다. 여기선 보기와 평가만.
@router.get("/reviews", response_model=list[DraftItem])
async def list_reviews(
    _admin: CurrentAdminDep,
    drafts: DraftRepoDep,
    storage: StorageClientDep,
    school: str,
    grade: Annotated[int, Query(ge=0)],
    class_no: Annotated[int, Query(ge=0)],
) -> list[DraftItem]:
    """한 반의 초안 전체(번호 순) — 상태 무관. 개인 참여자는 school=''·0학년 0반."""
    records = await drafts.list_drafts(
        status=None, limit=500, offset=0, school=school, grade=grade, class_no=class_no
    )
    return await draft_items(records, storage)


@router.get("/reviews/progress", response_model=list[AdminReviewProgress])
async def review_progress(
    _admin: CurrentAdminDep, drafts: DraftRepoDep
) -> list[AdminReviewProgress]:
    """학교·학년·반별 참여(가입·설문 완료·미완료)와 평가(O/△/X·남은 수) 현황."""
    return [AdminReviewProgress(**asdict(p)) for p in await drafts.verdict_progress()]


@router.put("/reviews/{draft_id}", response_model=DraftItem)
async def set_review(
    draft_id: UUID,
    req: AdminVerdictRequest,
    _admin: CurrentAdminDep,
    drafts: DraftRepoDep,
    storage: StorageClientDep,
) -> DraftItem:
    """O/X/△ 기록. 같은 초안을 다시 평가하면 덮어쓴다(마지막 평가가 남는다)."""
    if await drafts.get(draft_id) is None:
        raise NotFoundError("초안을 찾을 수 없습니다.")
    await drafts.set_verdict(draft_id, req.verdict, req.reason.strip())
    draft = await drafts.get(draft_id)
    assert draft is not None
    return (await draft_items([draft], storage))[0]


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
