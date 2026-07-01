"""generated.sessions, generated.answers 접근.

"다시 하기"는 새 session INSERT (UPDATE 아님) — 학생당 여러 행이 쌓인다.
완료 여부는 가장 최근 session.status == 'completed' 로 판단한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.repositories.base import BaseRepository

_COLUMNS = "id, student_id, status, created_at, completed_at"


@dataclass(frozen=True, slots=True)
class SessionRecord:
    id: UUID
    student_id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None


class SessionRepository(BaseRepository):
    async def create(
        self,
        student_id: UUID,
        *,
        status: str = "in_progress",
        conn: Any = None,
    ) -> SessionRecord:
        """새 세션 행 생성. status='completed'이면 completed_at=now().

        conn이 주어지면 그 커넥션(트랜잭션)으로 실행, 없으면 자체 풀에서 acquire.
        """
        query = f"""
            insert into generated.sessions (student_id, status, completed_at)
            values ($1, $2, case when $2 = 'completed' then now() else null end)
            returning {_COLUMNS}
        """
        if conn is not None:
            row = await conn.fetchrow(query, student_id, status)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, student_id, status)
        assert row is not None  # RETURNING 이므로 항상 한 행
        return SessionRecord(
            id=row["id"],
            student_id=row["student_id"],
            status=row["status"],
            created_at=row["created_at"],
            completed_at=row["completed_at"],
        )

    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None:
        """그 학생의 가장 최근 세션 1개(created_at 내림차순). 없으면 None."""
        query = f"""
            select {_COLUMNS}
            from generated.sessions
            where student_id = $1
            order by created_at desc
            limit 1
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, student_id)
        if row is None:
            return None
        return SessionRecord(
            id=row["id"],
            student_id=row["student_id"],
            status=row["status"],
            created_at=row["created_at"],
            completed_at=row["completed_at"],
        )

    # 아래는 질문 진행 흐름(별도 작업 영역) — 이번 범위 밖이라 스텁 유지.
    async def update_status(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def insert_answer(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def list_answers(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
