"""generated.sessions, generated.answers 접근.

"다시 하기"는 새 session INSERT (UPDATE 아님) — 학생당 여러 행이 쌓인다.
완료 여부는 가장 최근 session.status == 'completed' 로 판단한다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.repositories.base import BaseRepository

_COLUMNS = "id, student_id, status, created_at, completed_at"
_ANSWER_COLUMNS = "id, session_id, stage, payload, created_at"


@dataclass(frozen=True, slots=True)
class SessionRecord:
    id: UUID
    student_id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None


@dataclass(frozen=True, slots=True)
class AnswerRecord:
    id: UUID
    session_id: UUID
    stage: str
    payload: dict[str, Any]
    created_at: datetime


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

    async def get_by_id(self, session_id: UUID) -> SessionRecord | None:
        """세션 1개를 id로 조회. 없으면 None."""
        query = f"select {_COLUMNS} from generated.sessions where id = $1"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, session_id)
        return _to_session(row)

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
        return _to_session(row)

    async def get_latest_completed_for_student(
        self, student_id: UUID
    ) -> SessionRecord | None:
        """그 학생의 가장 최근 'completed' 세션 1개. 없으면 None.

        진행 중(in_progress) 세션이 완료 판정을 가리지 않도록,
        완료/재시도 게이트는 최근 세션이 아니라 최근 '완료' 세션을 본다.
        """
        query = f"""
            select {_COLUMNS}
            from generated.sessions
            where student_id = $1 and status = 'completed'
            order by created_at desc
            limit 1
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, student_id)
        return _to_session(row)

    async def update_status(
        self, session_id: UUID, status: str, *, conn: Any = None
    ) -> SessionRecord:
        """세션 상태 변경. 'completed'로 바뀔 때 completed_at을 채운다."""
        query = f"""
            update generated.sessions
            set status = $2,
                completed_at = case when $2 = 'completed' then now() else completed_at end
            where id = $1
            returning {_COLUMNS}
        """
        if conn is not None:
            row = await conn.fetchrow(query, session_id, status)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, session_id, status)
        record = _to_session(row)
        assert record is not None  # 호출 측에서 존재를 보장
        return record

    async def insert_answer(
        self, session_id: UUID, stage: str, payload: dict[str, Any], *, conn: Any = None
    ) -> AnswerRecord:
        """세션에 단계별 답변을 저장. 같은 (session, stage)면 payload를 덮어쓴다."""
        query = f"""
            insert into generated.answers (session_id, stage, payload)
            values ($1, $2, $3::jsonb)
            on conflict (session_id, stage)
            do update set payload = excluded.payload, created_at = now()
            returning {_ANSWER_COLUMNS}
        """
        encoded = json.dumps(payload, ensure_ascii=False)
        if conn is not None:
            row = await conn.fetchrow(query, session_id, stage, encoded)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, session_id, stage, encoded)
        assert row is not None
        return _to_answer(row)

    async def list_answers(self, session_id: UUID) -> list[AnswerRecord]:
        """세션의 모든 답변을 stage 순서(생성순)로 반환."""
        query = f"""
            select {_ANSWER_COLUMNS}
            from generated.answers
            where session_id = $1
            order by created_at asc
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, session_id)
        return [_to_answer(row) for row in rows]


def _to_session(row: Any) -> SessionRecord | None:
    if row is None:
        return None
    return SessionRecord(
        id=row["id"],
        student_id=row["student_id"],
        status=row["status"],
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


def _to_answer(row: Any) -> AnswerRecord:
    raw = row["payload"]
    payload = json.loads(raw) if isinstance(raw, str) else raw
    return AnswerRecord(
        id=row["id"],
        session_id=row["session_id"],
        stage=row["stage"],
        payload=payload if isinstance(payload, dict) else {},
        created_at=row["created_at"],
    )
