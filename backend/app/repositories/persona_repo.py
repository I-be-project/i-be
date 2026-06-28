"""generated.personas 접근."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.repositories.base import BaseRepository

_COLUMNS = "id, session_id, name, tagline, keywords, fields, created_at"


@dataclass(frozen=True, slots=True)
class PersonaRecord:
    id: UUID
    session_id: UUID
    name: str
    tagline: str
    keywords: list[str]
    fields: list[str]
    created_at: datetime


def _json_str_list(raw: object) -> list[str]:
    """jsonb 컬럼 → list[str]. asyncpg는 jsonb를 문자열로 반환하므로 파싱한다."""
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(parsed, list):
        return [str(item) for item in parsed]
    return []


class PersonaRepository(BaseRepository):
    async def create(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None:
        """세션에 연결된 페르소나 1개. 없으면 None."""
        query = f"""
            select {_COLUMNS}
            from generated.personas
            where session_id = $1
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, session_id)
        if row is None:
            return None
        return PersonaRecord(
            id=row["id"],
            session_id=row["session_id"],
            name=row["name"],
            tagline=row["tagline"],
            keywords=_json_str_list(row["keywords"]),
            fields=_json_str_list(row["fields"]),
            created_at=row["created_at"],
        )
