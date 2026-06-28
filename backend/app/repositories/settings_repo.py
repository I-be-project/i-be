"""ops.settings 접근 — 행사 전역 key/value 설정.

value는 jsonb. asyncpg는 jsonb를 문자열로 반환/입력하므로 json으로 직렬화·역직렬화한다.
"""

from __future__ import annotations

import json

from app.repositories.base import BaseRepository


class SettingsRepository(BaseRepository):
    async def get(self, key: str) -> object | None:
        """key의 value(jsonb)를 파싱해 반환. 행이 없으면 None."""
        query = "select value from ops.settings where key = $1"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, key)
        if row is None:
            return None
        raw = row["value"]
        parsed: object = json.loads(raw) if isinstance(raw, str) else raw
        return parsed

    async def set(self, key: str, value: object) -> None:
        """key/value upsert (jsonb)."""
        query = """
            insert into ops.settings (key, value, updated_at)
            values ($1, $2::jsonb, now())
            on conflict (key) do update
                set value = excluded.value,
                    updated_at = now()
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, key, json.dumps(value))
