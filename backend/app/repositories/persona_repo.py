"""generated.personas 접근."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.repositories.base import BaseRepository
from app.schemas.persona import Persona

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
    async def create(
        self,
        session_id: UUID,
        persona: Persona,
        *,
        conn: Any = None,
    ) -> PersonaRecord:
        """세션에 연결된 페르소나 행 생성. keywords/fields는 jsonb로 저장."""
        query = f"""
            insert into generated.personas (session_id, name, tagline, keywords, fields)
            values ($1, $2, $3, $4::jsonb, $5::jsonb)
            returning {_COLUMNS}
        """
        keywords = json.dumps(list(persona.keywords), ensure_ascii=False)
        fields = json.dumps(list(persona.fields), ensure_ascii=False)
        args = (session_id, persona.name, persona.tagline, keywords, fields)
        if conn is not None:
            row = await conn.fetchrow(query, *args)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, *args)
        assert row is not None
        return PersonaRecord(
            id=row["id"],
            session_id=row["session_id"],
            name=row["name"],
            tagline=row["tagline"],
            keywords=_json_str_list(row["keywords"]),
            fields=_json_str_list(row["fields"]),
            created_at=row["created_at"],
        )

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
