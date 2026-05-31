"""관리자 대시보드·통계 로직."""

from __future__ import annotations


class AdminService:
    async def dashboard(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def keyword_stats(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
