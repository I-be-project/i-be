"""rewards.booths 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class BoothRepository(BaseRepository):
    async def list_active(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
