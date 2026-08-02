"""ops.booth_visits 접근 — 학생의 부스 방문 기록.

(student_id, booth_id)에 unique 제약이 걸려 있다. 같은 부스를 다시 찍는 것은
정상 동작이므로 create는 예외 대신 None을 돌려주고, "이미 방문함" 판단은 서비스가 한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from app.repositories.base import BaseRepository

_COLUMNS = "id, student_id, booth_id, created_at"


@dataclass(frozen=True, slots=True)
class BoothVisitRecord:
    """ops.booth_visits 한 행."""

    id: UUID
    student_id: UUID
    booth_id: UUID
    created_at: datetime


def _to_record(row: asyncpg.Record) -> BoothVisitRecord:
    return BoothVisitRecord(
        id=row["id"],
        student_id=row["student_id"],
        booth_id=row["booth_id"],
        created_at=row["created_at"],
    )


class BoothVisitRepository(BaseRepository):
    async def create(self, *, student_id: UUID, booth_id: UUID) -> BoothVisitRecord | None:
        """방문 1건 기록. 이미 기록이 있으면 아무것도 넣지 않고 None.

        on conflict do nothing이라 재방문 요청에도 created_at이 덮이지 않는다
        (첫 방문 시각을 보존한다).
        """
        query = f"""
            insert into ops.booth_visits (student_id, booth_id)
            values ($1, $2)
            on conflict (student_id, booth_id) do nothing
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, student_id, booth_id)
        return _to_record(row) if row is not None else None

    async def list_for_student(self, student_id: UUID) -> list[BoothVisitRecord]:
        """그 학생의 모든 방문 기록(프로필 화면의 부스 탭/성향 탭용)."""
        query = f"""
            select {_COLUMNS}
              from ops.booth_visits
             where student_id = $1
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, student_id)
        return [_to_record(row) for row in rows]

    async def get(self, *, student_id: UUID, booth_id: UUID) -> BoothVisitRecord | None:
        """그 학생의 그 부스 방문 기록. 없으면 None."""
        query = f"""
            select {_COLUMNS}
              from ops.booth_visits
             where student_id = $1 and booth_id = $2
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, student_id, booth_id)
        return _to_record(row) if row is not None else None
