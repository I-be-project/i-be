"""pii.students 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class StudentRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_by_id(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def soft_delete(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def clear_photo(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
