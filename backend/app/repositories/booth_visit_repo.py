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


@dataclass(frozen=True, slots=True)
class BoothVisitCountRow:
    """부스 1개의 방문 집계 — 부스별 참여인원 화면용."""

    booth_id: UUID
    code: str
    name: str
    visit_count: int


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

    async def count_by_booth(self) -> list[BoothVisitCountRow]:
        """부스별 방문 학생 수(등록 순). 아무도 찍지 않은 부스도 0으로 포함한다.

        (student_id, booth_id) unique 제약 덕분에 count(*)가 곧 방문 학생 수다
        (같은 학생이 같은 부스를 여러 번 찍어도 행이 하나뿐이다).
        """
        query = """
            select b.id, b.code, b.name, count(v.id) as visit_count
              from ops.booths b
              left join ops.booth_visits v on v.booth_id = b.id
             group by b.id, b.code, b.name
             order by b.created_at
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [
            BoothVisitCountRow(
                booth_id=row["id"],
                code=row["code"],
                name=row["name"],
                visit_count=row["visit_count"],
            )
            for row in rows
        ]

    async def count_unique_students(self) -> int:
        """부스를 하나라도 찍은 학생 수(중복 제거) — 연인원이 아닌 실인원."""
        query = "select count(distinct student_id) from ops.booth_visits"
        async with self._pool.acquire() as conn:
            value = await conn.fetchval(query)
        return int(value or 0)
