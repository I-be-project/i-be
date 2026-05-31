"""ops.jobs 접근.

핵심 동작:
- claim_next: SELECT FOR UPDATE SKIP LOCKED 패턴으로 1개 잡 점유
- mark_done / mark_failed: 상태 전이
- recover_stuck: claimed_at이 임계치 초과한 processing 잡을 pending으로 되돌림
"""

from __future__ import annotations

from app.repositories.base import BaseRepository


class JobRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def claim_next(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def mark_done(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def mark_failed(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def recover_stuck(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
