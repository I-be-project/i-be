"""/api/cards — 카드 생성 잡 큐잉·폴링·조회."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/api/cards", tags=["cards"])


@router.post("/generate")
async def enqueue_card_generation() -> dict[str, str]:
    """페르소나 + 이미지 생성 잡을 큐에 등록. job_id 반환."""
    raise NotImplementedError


@router.get("/jobs/{job_id}")
async def get_job(job_id: UUID) -> dict[str, object]:
    """잡 상태 폴링용."""
    raise NotImplementedError


@router.get("/{card_id}")
async def get_card(card_id: UUID) -> dict[str, object]:
    """카드 상세. 본인 토큰 또는 share token으로 접근."""
    raise NotImplementedError


@router.post("/{card_id}/share-links")
async def create_share_link(card_id: UUID) -> dict[str, str]:
    """단기 공유 토큰 발급 (부모/친구용)."""
    raise NotImplementedError
