"""generated.persona_drafts 접근 — 일괄 생성 초안과 검수 확정.

초안은 세션당 하나(session_id unique). 재생성은 같은 행을 갱신한다.
승인(approve)은 초안을 generated.personas / generated.cards로 복사한다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.repositories.base import BaseRepository

DRAFT_STATUSES = ("pending", "approved", "rejected")

# 학생 정보는 카드(이름·학교·학년·반·번호)와 원본 사진 표시에 필요해 함께 읽는다.
_SELECT = """
    select d.id, d.session_id, d.student_id, d.status, d.name, d.base_career, d.headline,
           d.tagline, d.source_career_pool, d.pool_extended, d.raw, d.image_key, d.error,
           d.note, d.updated_at, d.reviewed_at,
           s.name as student_name, s.school, s.grade, s.class_no, s.student_no, s.photo_key
    from generated.persona_drafts d
    join pii.students s on s.id = d.student_id
"""


# 초안이 아직 없는 "학생별 최근 완료 세션". $1~$4: student_id·school·grade·class_no (null이면 무시).
_TARGETS = """
    select * from (
        select distinct on (se.student_id) se.id as session_id, se.student_id,
               st.school, st.grade, st.class_no, st.student_no
        from generated.sessions se
        join pii.students st on st.id = se.student_id
        where se.status = 'completed' and st.deleted_at is null
          and ($1::uuid is null or se.student_id = $1)
          and ($2::text is null or st.school = $2)
          and ($3::int is null or st.grade = $3)
          and ($4::int is null or st.class_no = $4)
        order by se.student_id, se.completed_at desc
    ) latest
    where not exists (
        select 1 from generated.persona_drafts d where d.session_id = latest.session_id
    )
"""


@dataclass(frozen=True, slots=True)
class DraftRecord:
    id: UUID
    session_id: UUID
    student_id: UUID
    status: str
    name: str
    base_career: str
    headline: str
    tagline: str
    source_career_pool: bool | None
    pool_extended: bool | None
    raw: dict[str, Any]
    image_key: str | None
    error: str | None
    note: str
    updated_at: datetime
    reviewed_at: datetime | None
    student_name: str
    school: str
    grade: int
    class_no: int
    student_no: int
    photo_key: str | None


@dataclass(frozen=True, slots=True)
class DraftTarget:
    """초안이 아직 없는 완료 세션 — 일괄 생성 대상."""

    session_id: UUID
    student_id: UUID


@dataclass(frozen=True, slots=True)
class DraftText:
    """codex 페르소나 출력에서 카드에 쓰는 값."""

    name: str
    base_career: str
    headline: str
    tagline: str
    source_career_pool: bool | None
    pool_extended: bool | None


def _to_record(row: Any) -> DraftRecord:
    raw = row["raw"]
    return DraftRecord(
        id=row["id"],
        session_id=row["session_id"],
        student_id=row["student_id"],
        status=row["status"],
        name=row["name"],
        base_career=row["base_career"],
        headline=row["headline"],
        tagline=row["tagline"],
        source_career_pool=row["source_career_pool"],
        pool_extended=row["pool_extended"],
        raw=json.loads(raw) if isinstance(raw, str) else dict(raw),
        image_key=row["image_key"],
        error=row["error"],
        note=row["note"],
        updated_at=row["updated_at"],
        reviewed_at=row["reviewed_at"],
        student_name=row["student_name"],
        school=row["school"],
        grade=row["grade"],
        class_no=row["class_no"],
        student_no=row["student_no"],
        photo_key=row["photo_key"],
    )


class DraftRepository(BaseRepository):
    async def list_targets(
        self,
        *,
        limit: int,
        student_id: UUID | None = None,
        school: str | None = None,
        grade: int | None = None,
        class_no: int | None = None,
    ) -> list[DraftTarget]:
        """학생별 최근 완료 세션 중 초안이 없는 것. 학교·학년·반 순."""
        query = f"""
            {_TARGETS}
            order by school, grade, class_no, student_no
            limit $5
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, student_id, school, grade, class_no, limit)
        return [DraftTarget(session_id=r["session_id"], student_id=r["student_id"]) for r in rows]

    async def count_targets_by_class(self, school: str) -> dict[tuple[int, int], int]:
        """학교의 (학년, 반)별 대상 수 — list_targets와 같은 조건. 반 목록에 함께 보여준다."""
        query = f"""
            select grade, class_no, count(*) as n from ({_TARGETS}) t
            group by grade, class_no
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, None, school, None, None)
        return {(r["grade"], r["class_no"]): r["n"] for r in rows}

    async def save_text(
        self, session_id: UUID, student_id: UUID, text: DraftText, raw: dict[str, Any]
    ) -> UUID:
        """텍스트 생성 결과 저장. 이미 있으면 덮어쓰고 검수 대기로 되돌린다."""
        query = """
            insert into generated.persona_drafts
                (session_id, student_id, name, base_career, headline, tagline,
                 source_career_pool, pool_extended, raw)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            on conflict (session_id) do update set
                name = excluded.name, base_career = excluded.base_career,
                headline = excluded.headline, tagline = excluded.tagline,
                source_career_pool = excluded.source_career_pool,
                pool_extended = excluded.pool_extended, raw = excluded.raw,
                status = 'pending', reviewed_at = null, updated_at = now()
            returning id
        """
        async with self._pool.acquire() as conn:
            draft_id: UUID = await conn.fetchval(
                query,
                session_id,
                student_id,
                text.name,
                text.base_career,
                text.headline,
                text.tagline,
                text.source_career_pool,
                text.pool_extended,
                json.dumps(raw, ensure_ascii=False),
            )
        return draft_id

    async def save_image(self, draft_id: UUID, *, image_key: str | None, error: str | None) -> None:
        """이미지 생성 결과. 실패면 기존 이미지는 두고 error만 남긴다."""
        query = """
            update generated.persona_drafts
            set image_key = coalesce($2, image_key), error = $3,
                status = case when $2 is null then status else 'pending' end,
                reviewed_at = case when $2 is null then reviewed_at end,
                updated_at = now()
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id, image_key, error)

    async def clear_image(self, draft_id: UUID) -> None:
        """생성 이미지 해제 → 카드는 폴백 캐릭터. S3 객체는 지우지 않는다(사진 영구 보관)."""
        query = """
            update generated.persona_drafts
            set image_key = null, error = '검수자가 폴백 이미지 선택', updated_at = now()
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id)

    async def get(self, draft_id: UUID) -> DraftRecord | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(f"{_SELECT} where d.id = $1", draft_id)
        return _to_record(row) if row else None

    async def list_drafts(
        self, *, status: str | None, limit: int, offset: int
    ) -> list[DraftRecord]:
        query = f"""
            {_SELECT}
            where ($1::text is null or d.status = $1)
            order by s.school, s.grade, s.class_no, s.student_no
            limit $2 offset $3
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, status, limit, offset)
        return [_to_record(r) for r in rows]

    async def count_by_status(self) -> dict[str, int]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "select status, count(*) as n from generated.persona_drafts group by status"
            )
        counts = dict.fromkeys(DRAFT_STATUSES, 0)
        counts.update({r["status"]: r["n"] for r in rows})
        return counts

    async def update_text(self, draft_id: UUID, text: DraftText, *, note: str) -> None:
        """검수자가 고친 문구. 상태는 건드리지 않는다."""
        query = """
            update generated.persona_drafts
            set name = $2, base_career = $3, headline = $4, tagline = $5, note = $6,
                updated_at = now()
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(
                query, draft_id, text.name, text.base_career, text.headline, text.tagline, note
            )

    async def delete_drafts(self, draft_ids: list[UUID]) -> int:
        """초안 삭제 → 그 세션은 다시 일괄 생성 대상이 된다. 삭제한 초안 수 반환.

        승인된 초안이면 확정본(personas, cards는 cascade)도 지운다 — 확정본만 남으면
        학생 프로필에 옛 페르소나가 계속 보인다. 승인으로 만든 행(approved_at)만 대상.
        S3 이미지·카드 파일은 지우지 않는다(사진 영구 보관).
        """
        async with self._pool.transaction() as conn:
            await conn.execute(
                """
                delete from generated.personas p
                using generated.persona_drafts d
                where d.id = any($1::uuid[]) and d.status = 'approved'
                  and p.session_id = d.session_id and p.approved_at is not null
                """,
                draft_ids,
            )
            deleted: int = await conn.fetchval(
                """
                with gone as (
                    delete from generated.persona_drafts where id = any($1::uuid[]) returning 1
                )
                select count(*) from gone
                """,
                draft_ids,
            )
        return deleted

    async def reject(self, draft_id: UUID) -> None:
        query = """
            update generated.persona_drafts
            set status = 'rejected', reviewed_at = now(), updated_at = now()
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id)

    async def approve(self, draft: DraftRecord, *, card_key: str) -> None:
        """초안 → 확정본(personas·cards). 다시 승인하면 확정본을 덮어쓴다."""
        async with self._pool.transaction() as conn:
            persona_id = await conn.fetchval(
                """
                insert into generated.personas
                    (session_id, name, tagline, base_career, headline,
                     source_career_pool, pool_extended, image_key, approved_at)
                values ($1, $2, $3, $4, $5, $6, $7, $8, now())
                on conflict (session_id) do update set
                    name = excluded.name, tagline = excluded.tagline,
                    base_career = excluded.base_career, headline = excluded.headline,
                    source_career_pool = excluded.source_career_pool,
                    pool_extended = excluded.pool_extended, image_key = excluded.image_key,
                    approved_at = excluded.approved_at
                returning id
                """,
                draft.session_id,
                draft.name,
                draft.tagline,
                draft.base_career,
                draft.headline,
                draft.source_career_pool,
                draft.pool_extended,
                draft.image_key,
            )
            await conn.execute(
                """
                insert into generated.cards (persona_id, card_image_key) values ($1, $2)
                on conflict (persona_id) do update set card_image_key = excluded.card_image_key
                """,
                persona_id,
                card_key,
            )
            await conn.execute(
                """
                update generated.persona_drafts
                set status = 'approved', reviewed_at = now(), updated_at = now()
                where id = $1
                """,
                draft.id,
            )
