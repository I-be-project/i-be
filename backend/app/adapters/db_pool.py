"""asyncpg 연결 풀 래퍼.

- 단순한 connect/disconnect/acquire 인터페이스
- Repository 레이어가 이 클래스에만 의존하도록
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg


class DBPool:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self, min_size: int = 1, max_size: int = 10) -> None:
        if self._pool is not None:
            return
        self._pool = await asyncpg.create_pool(
            self._dsn,
            min_size=min_size,
            max_size=max_size,
        )

    async def disconnect(self) -> None:
        if self._pool is None:
            return
        await self._pool.close()
        self._pool = None

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        if self._pool is None:
            raise RuntimeError("DBPool not connected")
        async with self._pool.acquire() as conn:
            yield conn

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[asyncpg.Connection]:
        async with self.acquire() as conn:
            async with conn.transaction():
                yield conn
