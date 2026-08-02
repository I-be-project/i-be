"""ops.booths 접근 — 부스 CRUD.

code는 unique. 생성 시 충돌하면 asyncpg.UniqueViolationError가 그대로 올라오고,
새 코드로 재시도하는 책임은 BoothService에 있다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from app.repositories.base import BaseRepository

_COLUMNS = "id, code, name, description, created_at, updated_at"


@dataclass(frozen=True, slots=True)
class BoothRecord:
    """ops.booths 한 행."""

    id: UUID
    code: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


def _to_record(row: asyncpg.Record) -> BoothRecord:
    return BoothRecord(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class BoothRepository(BaseRepository):
    async def create(self, *, code: str, name: str, description: str | None) -> BoothRecord:
        """부스 1건 생성. code가 이미 있으면 asyncpg.UniqueViolationError."""
        query = f"""
            insert into ops.booths (code, name, description)
            values ($1, $2, $3)
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code, name, description)
        assert row is not None  # insert ... returning은 성공 시 항상 1행
        return _to_record(row)

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        query = f"select {_COLUMNS} from ops.booths where id = $1"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return _to_record(row) if row is not None else None

    async def list_all(self) -> list[BoothRecord]:
        """전체 부스 — 등록 순. 부스는 행사당 수십 개라 페이지네이션을 두지 않는다."""
        query = f"select {_COLUMNS} from ops.booths order by created_at"
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [_to_record(row) for row in rows]

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None
    ) -> BoothRecord | None:
        """이름·설명을 준 값으로 교체. 없는 id면 None.

        부분 수정(보낸 필드만 반영)은 서비스가 기존 값과 병합해 완성값을 넘기는 방식으로 처리한다.
        여기서 coalesce를 쓰면 description을 null로 지우는 요청과 구분할 수 없다.
        """
        query = f"""
            update ops.booths
               set name        = $2,
                   description = $3,
                   updated_at  = now()
             where id = $1
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id, name, description)
        return _to_record(row) if row is not None else None

    async def delete(self, booth_id: UUID) -> bool:
        """삭제. 실제로 지워졌으면 True, 없던 id면 False."""
        query = "delete from ops.booths where id = $1 returning id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return row is not None
