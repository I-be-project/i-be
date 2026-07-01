"""rewards.operators 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class OperatorRepository(BaseRepository):
    async def get_by_login_id(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def update_last_login(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
