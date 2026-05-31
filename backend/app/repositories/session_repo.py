"""generated.sessions, generated.answers 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def update_status(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def insert_answer(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def list_answers(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
