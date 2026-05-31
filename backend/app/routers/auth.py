"""/api/auth — 학생 등록·세션 발급."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register() -> dict[str, str]:
    """학생 닉네임·동의·사진 업로드 → 학생 세션 토큰 발급."""
    raise NotImplementedError


@router.post("/refresh")
async def refresh() -> dict[str, str]:
    """학생 세션 토큰 갱신."""
    raise NotImplementedError
