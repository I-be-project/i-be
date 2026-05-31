"""generated.personas 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class PersonaRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_by_session(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
