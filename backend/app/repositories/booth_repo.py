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

_COLUMNS = "id, code, name, description, zone, created_at, updated_at"


@dataclass(frozen=True, slots=True)
class BoothRecord:
    """ops.booths 한 행."""

    id: UUID
    code: str
    name: str
    description: str | None
    # 'F'·'L'·'Y'·'C' 중 하나, 또는 존을 모르는 부스는 ''.
    zone: str
    created_at: datetime
    updated_at: datetime
    # 이 부스에 연결된 역량 키. 매핑 자료가 오기 전에는 빈 튜플이다.
    competencies: tuple[str, ...] = ()


# 부스 1행 + 연결된 역량 배열. left join이라 역량이 없는 부스도 빈 배열로 나온다.
_SELECT_WITH_COMPETENCIES = f"""
    select {", ".join("b." + c.strip() for c in _COLUMNS.split(","))},
           coalesce(
               array_agg(bc.competency order by bc.competency)
                   filter (where bc.competency is not null),
               '{{}}'
           ) as competencies
      from ops.booths b
      left join ops.booth_competencies bc on bc.booth_id = b.id
"""


def _to_record(row: asyncpg.Record) -> BoothRecord:
    # insert/update의 returning에는 competencies가 없다 — 그때는 빈 튜플로 둔다.
    raw = row["competencies"] if "competencies" in row.keys() else ()
    return BoothRecord(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        zone=row["zone"],
        competencies=tuple(raw),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class BoothRepository(BaseRepository):
    async def create(
        self, *, code: str, name: str, description: str | None, zone: str
    ) -> BoothRecord:
        """부스 1건 생성. code가 이미 있으면 asyncpg.UniqueViolationError."""
        query = f"""
            insert into ops.booths (code, name, description, zone)
            values ($1, $2, $3, $4)
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code, name, description, zone)
        assert row is not None  # insert ... returning은 성공 시 항상 1행
        return _to_record(row)

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        query = f"{_SELECT_WITH_COMPETENCIES} where b.id = $1 group by b.id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return _to_record(row) if row is not None else None

    async def get_by_code(self, code: str) -> BoothRecord | None:
        """QR/수동 입력으로 들어온 code로 부스를 찾는다. 없으면 None.

        code 정규화(대문자·공백 제거)는 호출부(BoothVisitService)의 책임이다.
        """
        query = f"{_SELECT_WITH_COMPETENCIES} where b.code = $1 group by b.id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code)
        return _to_record(row) if row is not None else None

    async def list_all(self) -> list[BoothRecord]:
        """전체 부스 — 등록 순. 부스는 행사당 수십 개라 페이지네이션을 두지 않는다."""
        query = f"{_SELECT_WITH_COMPETENCIES} group by b.id order by b.created_at"
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [_to_record(row) for row in rows]

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None, zone: str
    ) -> BoothRecord | None:
        """이름·설명·존을 준 값으로 교체. 없는 id면 None.

        부분 수정(보낸 필드만 반영)은 서비스가 기존 값과 병합해 완성값을 넘기는 방식으로 처리한다.
        여기서 coalesce를 쓰면 description을 null로 지우는 요청과 구분할 수 없다.
        """
        query = f"""
            update ops.booths
               set name        = $2,
                   description = $3,
                   zone        = $4,
                   updated_at  = now()
             where id = $1
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id, name, description, zone)
        return _to_record(row) if row is not None else None

    async def delete(self, booth_id: UUID) -> bool:
        """삭제. 실제로 지워졌으면 True, 없던 id면 False."""
        query = "delete from ops.booths where id = $1 returning id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return row is not None

    async def replace_competencies(self, booth_id: UUID, competencies: list[str]) -> None:
        """이 부스의 역량을 준 목록으로 통째로 바꾼다.

        지우고 다시 넣는다. 최대 3행이라 차이를 계산하는 것보다 싸고, 중간 상태가 없다.
        한 트랜잭션에서 처리해 삭제만 되고 삽입이 실패하는 일이 없게 한다.
        """
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("delete from ops.booth_competencies where booth_id = $1", booth_id)
            if competencies:
                await conn.executemany(
                    "insert into ops.booth_competencies (booth_id, competency) values ($1, $2)",
                    [(booth_id, c) for c in competencies],
                )
