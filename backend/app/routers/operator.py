"""/api/operator — 운영자 로그인·QR 스캔·리워드 적립."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/operator", tags=["operator"])


@router.post("/login")
async def login() -> dict[str, str]:
    """운영자 로그인 → 운영자 세션 토큰 발급."""
    raise NotImplementedError


@router.post("/scan")
async def scan() -> dict[str, object]:
    """카드 QR(공유 토큰) 검증 + 닉네임·페르소나 타이틀 반환."""
    raise NotImplementedError


@router.post("/rewards")
async def grant_reward() -> dict[str, object]:
    """리워드 적립. 자기 부스에 대해서만 허용. reward_logs INSERT."""
    raise NotImplementedError
