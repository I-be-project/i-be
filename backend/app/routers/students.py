"""/api/students — 학생 본인 페이지·삭제 요청."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/me")
async def get_my_profile() -> dict[str, object]:
    """본인 페이지 데이터 — 카드, 부스 이력, 배지, 추천."""
    raise NotImplementedError


@router.delete("/me")
async def delete_my_data() -> dict[str, str]:
    """학생 데이터 삭제 요청 (soft delete + 사진/이미지 폐기)."""
    raise NotImplementedError
