"""generated.cards, generated.share_links 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class CardRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_by_share_token(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def create_share_link(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
