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


@dataclass(frozen=True, slots=True)
class StudentProgressRow:
    """관리자 진행도 조회용 — 학생의 가장 최근 세션 요약."""

    student_id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None
    has_persona: bool
    has_card: bool
    stages: list[str]


@dataclass(frozen=True, slots=True)
class SessionPersona:
    """세션에 붙은 페르소나(관리자 상세용). generated.personas 한 행."""

    name: str
    tagline: str
    keywords: list[str]
    fields: list[str]


@dataclass(frozen=True, slots=True)
class SessionContent:
    """관리자 상세용 — 한 세션의 답변·페르소나·카드 키."""

    id: UUID
    status: str
    created_at: datetime
    completed_at: datetime | None
    answers: list[AnswerRecord]
    persona: SessionPersona | None
    card_image_key: str | None


class SessionRepository(BaseRepository):
    async def delete_completed_for_student(self, student_id: UUID) -> None:
        """재시작을 확인한 학생의 완료 결과만 삭제한다. 답변·페르소나·카드는 FK CASCADE."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                "delete from generated.sessions where student_id = $1 and status = 'completed'",
                student_id,
            )

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

    async def get_latest_completed_for_student(self, student_id: UUID) -> SessionRecord | None:
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

    async def get_progress_for_students(
        self, student_ids: list[UUID]
    ) -> dict[UUID, StudentProgressRow]:
        """여러 학생의 진행도를 단일 쿼리로 조회(관리자 목록용, N+1 회피).

        각 학생의 '가장 최근 세션'만 본다(DISTINCT ON). 세션이 없는 학생은
        결과에 없으며(상위에서 not_started 처리), 있으면 상태·단계·페르소나/카드
        유무를 함께 담는다. 카드는 이미지 키가 실제로 있는 경우만 has_card=true.
        """
        if not student_ids:
            return {}
        query = """
            select
                s.student_id,
                s.status,
                s.created_at,
                s.completed_at,
                exists(
                    select 1 from generated.personas p where p.session_id = s.id
                ) as has_persona,
                exists(
                    select 1
                    from generated.cards c
                    join generated.personas p on p.id = c.persona_id
                    where p.session_id = s.id and c.card_image_key is not null
                ) as has_card,
                coalesce(
                    (select array_agg(a.stage) from generated.answers a
                     where a.session_id = s.id),
                    array[]::text[]
                ) as stages
            from (
                select distinct on (student_id) id, student_id, status, created_at, completed_at
                from generated.sessions
                where student_id = any($1::uuid[])
                order by student_id, created_at desc
            ) s
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, student_ids)
        return {
            row["student_id"]: StudentProgressRow(
                student_id=row["student_id"],
                status=row["status"],
                created_at=row["created_at"],
                completed_at=row["completed_at"],
                has_persona=row["has_persona"],
                has_card=row["has_card"],
                stages=list(row["stages"]),
            )
            for row in rows
        }

    async def list_sessions_with_content(self, student_id: UUID) -> list[SessionContent]:
        """학생의 모든 세션(최신순)과 각 세션의 답변·페르소나·카드 키를 조립.

        세션 수만큼 쿼리하지 않도록, 세션 id 집합으로 answers/personas/cards를
        각각 한 번씩 조회한 뒤 파이썬에서 세션별로 묶는다.
        """
        async with self._pool.acquire() as conn:
            session_rows = await conn.fetch(
                f"select {_COLUMNS} from generated.sessions "
                "where student_id = $1 order by created_at desc",
                student_id,
            )
            if not session_rows:
                return []
            session_ids = [r["id"] for r in session_rows]
            answer_rows = await conn.fetch(
                f"select {_ANSWER_COLUMNS} from generated.answers "
                "where session_id = any($1::uuid[]) order by created_at asc",
                session_ids,
            )
            persona_rows = await conn.fetch(
                "select session_id, name, tagline, keywords, fields "
                "from generated.personas where session_id = any($1::uuid[])",
                session_ids,
            )
            card_rows = await conn.fetch(
                "select p.session_id, c.card_image_key "
                "from generated.cards c "
                "join generated.personas p on p.id = c.persona_id "
                "where p.session_id = any($1::uuid[])",
                session_ids,
            )

        answers_by_session: dict[UUID, list[AnswerRecord]] = {}
        for row in answer_rows:
            answers_by_session.setdefault(row["session_id"], []).append(_to_answer(row))
        persona_by_session = {
            row["session_id"]: SessionPersona(
                name=row["name"],
                tagline=row["tagline"],
                keywords=_json_str_list(row["keywords"]),
                fields=_json_str_list(row["fields"]),
            )
            for row in persona_rows
        }
        card_key_by_session = {row["session_id"]: row["card_image_key"] for row in card_rows}

        return [
            SessionContent(
                id=r["id"],
                status=r["status"],
                created_at=r["created_at"],
                completed_at=r["completed_at"],
                answers=answers_by_session.get(r["id"], []),
                persona=persona_by_session.get(r["id"]),
                card_image_key=card_key_by_session.get(r["id"]),
            )
            for r in session_rows
        ]

    async def list_card_image_keys(self, student_id: UUID) -> list[str]:
        """학생의 모든 카드 이미지 S3 키(삭제 전 정리용). 키 없는 카드는 제외."""
        query = """
            select c.card_image_key
            from generated.cards c
            join generated.personas p on p.id = c.persona_id
            join generated.sessions s on s.id = p.session_id
            where s.student_id = $1 and c.card_image_key is not null
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, student_id)
        return [row["card_image_key"] for row in rows]


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


def _json_str_list(raw: object) -> list[str]:
    """jsonb 컬럼 → list[str]. asyncpg는 jsonb를 문자열로 반환할 수 있어 파싱한다."""
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(parsed, list):
        return [str(item) for item in parsed]
    return []


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
