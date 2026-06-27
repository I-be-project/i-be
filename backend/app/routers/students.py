"""/api/students — 학생 본인 페이지·사진 업로드·삭제 요청."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.core.errors import DomainError
from app.deps import AuthServiceDep, CurrentStudentDep
from app.schemas.auth import PhotoUploadResponse

router = APIRouter(prefix="/api/students", tags=["students"])

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


@router.get("/me")
async def get_my_profile() -> dict[str, object]:
    """본인 페이지 데이터 — 카드, 부스 이력, 배지, 추천."""
    raise NotImplementedError


@router.delete("/me")
async def delete_my_data() -> dict[str, str]:
    """학생 데이터 삭제 요청 (soft delete + 사진/이미지 폐기)."""
    raise NotImplementedError
