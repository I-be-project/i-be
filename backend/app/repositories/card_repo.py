"""generated.cards, generated.share_links 접근."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.repositories.base import BaseRepository

_COLUMNS = "id, persona_id, card_image_key, created_at"


@dataclass(frozen=True, slots=True)
class CardRecord:
    id: UUID
    persona_id: UUID
    card_image_key: str | None
    created_at: datetime


class CardRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_by_persona(self, persona_id: UUID) -> CardRecord | None:
        """페르소나에 연결된 카드 1개. 없으면 None."""
        query = f"""
            select {_COLUMNS}
            from generated.cards
            where persona_id = $1
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, persona_id)
        if row is None:
            return None
        return CardRecord(
            id=row["id"],
            persona_id=row["persona_id"],
            card_image_key=row["card_image_key"],
            created_at=row["created_at"],
        )

    async def get_by_share_token(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def create_share_link(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
