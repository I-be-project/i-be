"""외부 전달용 학생 데이터 일괄 조회 — /api/export/v1.

학생 한 페이지(id 순 커서)와 각 학생의 대표 세션·확정 페르소나·답변을 쿼리 두 번으로 읽는다.
대표 세션: 완료 세션 중 최신, 없으면 가장 최근 세션. 페르소나는 그 세션의 승인본만.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.repositories.base import BaseRepository
from app.repositories.session_repo import _ANSWER_COLUMNS, AnswerRecord, _to_answer


@dataclass(frozen=True, slots=True)
class ExportPersona:
    name: str
    headline: str
    base_career: str
    tagline: str
    competencies: list[str]
    image_key: str | None
    approved_at: datetime


@dataclass(frozen=True, slots=True)
class ExportRow:
    id: UUID
    kind: str
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    gender: str
    birth_date: str | None
    consent_privacy: bool
    created_at: datetime
    photo_key: str | None
    session_id: UUID | None
    session_status: str | None
    session_created_at: datetime | None
    completed_at: datetime | None
    persona: ExportPersona | None


_PAGE = """
    select s.id, s.kind, s.school, s.grade, s.class_no, s.student_no, s.name, s.gender,
           s.birth_date, s.consent_privacy, s.created_at, s.photo_key,
           se.id as session_id, se.status as session_status,
           se.created_at as session_created_at, se.completed_at,
           p.name as persona_name, p.headline, p.base_career, p.tagline, p.keywords,
           p.image_key, p.approved_at
    from pii.students s
    left join lateral (
        select id, status, created_at, completed_at from generated.sessions
        where student_id = s.id
        order by (status = 'completed') desc, created_at desc
        limit 1
    ) se on true
    left join generated.personas p on p.session_id = se.id and p.approved_at is not null
    -- 테스트 계정은 목록에서 빼고 단건($3)에서만 내준다 — 협력사가 시험 계정 id로 조회한다.
    where s.deleted_at is null and (s.kind <> 'test' or $3::uuid is not null)
      and ($1::uuid is null or s.id > $1)
      and ($3::uuid is null or s.id = $3)
    order by s.id
    limit $2
"""


class ExportRepository(BaseRepository):
    async def page(
        self, *, after: UUID | None, limit: int, student_id: UUID | None = None
    ) -> tuple[list[ExportRow], dict[UUID, list[AnswerRecord]]]:
        """(학생 행, 세션별 답변). 삭제된 학생은 제외, 테스트 계정은 student_id 단건일 때만."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(_PAGE, after, limit, student_id)
            session_ids = [r["session_id"] for r in rows if r["session_id"]]
            answer_rows = await conn.fetch(
                f"select {_ANSWER_COLUMNS} from generated.answers "
                "where session_id = any($1::uuid[]) order by created_at",
                session_ids,
            )
        answers: dict[UUID, list[AnswerRecord]] = {}
        for a in answer_rows:
            answers.setdefault(a["session_id"], []).append(_to_answer(a))
        return [_to_row(r) for r in rows], answers


def _to_row(row: Any) -> ExportRow:
    persona = None
    if row["approved_at"] is not None:
        raw = row["keywords"]
        keywords = json.loads(raw) if isinstance(raw, str) else raw
        persona = ExportPersona(
            name=row["persona_name"],
            headline=row["headline"],
            base_career=row["base_career"],
            tagline=row["tagline"],
            # 확정본의 keywords = 승인 시 복사한 역량 3개(draft_repo.approve).
            competencies=[str(k) for k in keywords] if isinstance(keywords, list) else [],
            image_key=row["image_key"],
            approved_at=row["approved_at"],
        )
    return ExportRow(
        id=row["id"],
        kind=row["kind"],
        school=row["school"],
        grade=row["grade"],
        class_no=row["class_no"],
        student_no=row["student_no"],
        name=row["name"],
        gender=row["gender"],
        birth_date=row["birth_date"],
        consent_privacy=row["consent_privacy"],
        created_at=row["created_at"],
        photo_key=row["photo_key"],
        session_id=row["session_id"],
        session_status=row["session_status"],
        session_created_at=row["session_created_at"],
        completed_at=row["completed_at"],
        persona=persona,
    )
