"""/api/admin — 관리자 대시보드·통계·운영자 관리."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
