"""generated.personas 접근."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
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
    # 카드에 들어간 AI 사진. None이면 학생이 캐릭터(폴백) 카드를 고른 상태다.
    image_key: str | None = None
    # 초안에 남아 있는 AI 사진 원본 — 학생이 AI 사진/캐릭터를 고를 수 있는지 판단한다.
    ai_image_key: str | None = None
    # 학생이 카드 사진을 고른 시각. 있으면 다시 고를 수 없다.
    photo_chosen_at: datetime | None = None


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
        *,
        name: str,
        tagline: str,
        keywords: list[str],
        fields: list[str],
        conn: Any = None,
    ) -> PersonaRecord:
        """세션에 연결된 페르소나 행 생성. keywords/fields는 jsonb로 저장."""
        query = f"""
            insert into generated.personas (session_id, name, tagline, keywords, fields)
            values ($1, $2, $3, $4::jsonb, $5::jsonb)
            returning {_COLUMNS}
        """
        args = (
            session_id,
            name,
            tagline,
            json.dumps(list(keywords), ensure_ascii=False),
            json.dumps(list(fields), ensure_ascii=False),
        )
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
        """세션에 연결된 페르소나 1개. 없으면 None. 초안의 AI 사진 원본도 함께 읽는다."""
        query = """
            select p.id, p.session_id, p.name, p.tagline, p.keywords, p.fields, p.created_at,
                   p.image_key, p.photo_chosen_at, d.image_key as ai_image_key
            from generated.personas p
            left join generated.persona_drafts d on d.session_id = p.session_id
            where p.session_id = $1
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
            image_key=row["image_key"],
            ai_image_key=row["ai_image_key"],
            photo_chosen_at=row["photo_chosen_at"],
        )
