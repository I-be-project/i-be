"""/api/students — 학생 본인 페이지·사진 업로드·삭제 요청."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile

from app.core.errors import DomainError
from app.deps import AuthServiceDep, CurrentStudentDep, SessionServiceDep
from app.schemas.auth import PhotoUploadResponse
from app.schemas.students import ProfileSummary, PublicProfileSummary, UpdateProfileRequest

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/shared/{code}", response_model=PublicProfileSummary)
async def get_shared_profile(
    code: str,
    sessions: SessionServiceDep,
    response: Response,
) -> PublicProfileSummary:
    """로그인 없이 테스트 계정의 공개 항목만 조회한다."""
    response.headers["Cache-Control"] = "no-store"
    return await sessions.get_public_profile(code)


# 학생 사진으로 허용하는 MIME 타입.
_ALLOWED_PHOTO_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
# 사진 최대 크기 (10MB) — 휴대폰 카메라 원본 여유.
_MAX_PHOTO_BYTES = 10 * 1024 * 1024


@router.post("/me/photo", response_model=PhotoUploadResponse)
async def upload_my_photo(
    student_id: CurrentStudentDep,
    auth: AuthServiceDep,
    file: Annotated[UploadFile, File(description="학생 사진 (jpeg/png/webp)")],
) -> PhotoUploadResponse:
    """촬영/선택한 사진을 업로드해 본인 계정에 연결.

    실제 파일 저장은 StorageClient.upload_photo(다른 팀원 작업)에 위임한다.
    """
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_PHOTO_TYPES:
        raise DomainError(
            f"지원하지 않는 이미지 형식입니다: {content_type or 'unknown'}",
            details={"allowed": sorted(_ALLOWED_PHOTO_TYPES)},
        )

    data = await file.read()
    if not data:
        raise DomainError("빈 파일은 업로드할 수 없습니다.")
    if len(data) > _MAX_PHOTO_BYTES:
        raise DomainError(
            "사진 용량이 너무 큽니다.",
            details={"max_bytes": _MAX_PHOTO_BYTES, "got_bytes": len(data)},
        )

    photo_key = await auth.attach_photo(student_id, data, content_type=content_type)
    return PhotoUploadResponse(photo_key=photo_key)


@router.get("/me", response_model=ProfileSummary)
async def get_my_profile(
    student_id: CurrentStudentDep,
    sessions: SessionServiceDep,
) -> ProfileSummary:
    """본인 프로필 상태 — 설문 완료 여부, 페르소나·카드, 다시 하기 스위치."""
    return await sessions.get_profile_summary(student_id)


@router.patch("/me", response_model=ProfileSummary)
async def update_my_profile(
    req: UpdateProfileRequest,
    student_id: CurrentStudentDep,
    auth: AuthServiceDep,
    sessions: SessionServiceDep,
) -> ProfileSummary:
    """본인 이름/성별 수정. 로그인 식별 키(학교/학년/반/번호)·비밀번호는 이 API로 못 바꾼다."""
    await auth.update_profile(student_id, name=req.name, gender=req.gender)
    return await sessions.get_profile_summary(student_id)


@router.delete("/me")
async def delete_my_data() -> dict[str, str]:
    """학생 데이터 삭제 요청 (soft delete + 사진/이미지 폐기)."""
    raise NotImplementedError
