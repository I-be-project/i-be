"""Repository 베이스 — DB 풀 주입."""

from __future__ import annotations

from app.adapters.db_pool import DBPool


class BaseRepository:
    def __init__(self, pool: DBPool) -> None:
        self._pool = pool
