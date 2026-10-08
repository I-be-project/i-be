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

# 다시 만들 대상 분류 → 조건. 원본 사진이 없거나 검수자가 폴백을 고른 건은 대상이 아니다.
_REFUSED = "d.error like 'codex가 이미지를 만들지 않았습니다%'"
DRAFT_ISSUES = {
    # 실행 실패·시간 초과·중간에 끊김 — 다시 돌리면 대개 된다.
    "codex_failed": f"""d.image_key is null and s.photo_key is not null
        and not ({_REFUSED}) and coalesce(d.error, '') <> '검수자가 폴백 이미지 선택'""",
    # 얼굴이 아님·너무 어두움 등 사진 문제로 codex가 거절.
    "codex_refused": f"d.image_key is null and s.photo_key is not null and {_REFUSED}",
    "triangle": "d.verdict = 'triangle'",
    # /dev/review에서 다시 만들어 성공했고 아직 다시 평가하지 않은 것.
    "regenerated": "d.regenerated_at is not null and d.verdict is null and d.error is null",
}

# 학생 정보는 카드(이름·학교·학년·반·번호)와 원본 사진 표시에 필요해 함께 읽는다.
_SELECT = """
    select d.id, d.session_id, d.student_id, d.status, d.name, d.base_career, d.headline,
           d.tagline, d.source_career_pool, d.pool_extended, d.raw, d.image_key, d.error,
           d.note, d.updated_at, d.reviewed_at, d.verdict, d.verdict_reason,
           d.regenerated_at, d.prev_verdict, d.prev_verdict_reason,
           s.name as student_name, s.school, s.grade, s.class_no, s.student_no, s.photo_key
    from generated.persona_drafts d
    join pii.students s on s.id = d.student_id
"""

# 초안 목록·개수의 학교·학년·반 범위. $1~$3: school·grade·class_no (null이면 무시).
_CLASS_FILTER = """
    ($1::text is null or s.school = $1)
    and ($2::int is null or s.grade = $2)
    and ($3::int is null or s.class_no = $3)
"""

# 초안이 아직 없는 "학생별 최근 완료 세션". $1~$4: student_id·school·grade·class_no (null이면 무시).
_TARGETS = """
    select * from (
        select distinct on (se.student_id) se.id as session_id, se.student_id,
               st.school, st.grade, st.class_no, st.student_no
        from generated.sessions se
        join pii.students st on st.id = se.student_id
        where se.status = 'completed' and st.deleted_at is null
          -- 테스트 계정은 개인 참여자와 같은 school=''라 반 단위 일괄 생성에서 뺀다.
          and (st.kind <> 'test' or $1::uuid is not null)
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
    verdict: str | None
    verdict_reason: str
    regenerated_at: datetime | None
    prev_verdict: str | None
    prev_verdict_reason: str
    student_name: str
    school: str
    grade: int
    class_no: int
    student_no: int
    photo_key: str | None


@dataclass(frozen=True, slots=True)
class VerdictProgress:
    """한 반의 참여·평가 현황. 참여 분류는 가장 최근 세션 기준(좌석표와 같다)."""

    school: str
    grade: int
    class_no: int
    registered: int
    completed: int
    in_progress: int
    not_started: int
    drafts: int
    o: int
    triangle: int
    x: int


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
        verdict=row["verdict"],
        verdict_reason=row["verdict_reason"],
        regenerated_at=row["regenerated_at"],
        prev_verdict=row["prev_verdict"],
        prev_verdict_reason=row["prev_verdict_reason"],
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

    async def count_targets(self) -> int:
        """전체 학교의 대상 수 — list_targets와 같은 조건."""
        async with self._pool.acquire() as conn:
            n: int = await conn.fetchval(
                f"select count(*) from ({_TARGETS}) t", None, None, None, None
            )
        return n

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
                status = 'pending', reviewed_at = null, updated_at = now(),
                verdict = null, verdict_reason = '', verdict_at = null
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
                -- 새 이미지면 다시 검수해야 한다 — O/X/△ 평가를 지운다.
                verdict = case when $2 is null then verdict end,
                verdict_reason = case when $2 is null then verdict_reason else '' end,
                verdict_at = case when $2 is null then verdict_at end,
                updated_at = now()
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id, image_key, error)

    async def mark_regenerated(self, draft_id: UUID) -> None:
        """재생성 직전에 부른다 — 지금 평가를 이전 평가로 옮겨 둔다(성공하면 평가가 지워진다)."""
        query = """
            update generated.persona_drafts
            set regenerated_at = now(),
                prev_verdict = coalesce(verdict, prev_verdict),
                prev_verdict_reason = case when verdict is null then prev_verdict_reason
                                           else verdict_reason end
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id)

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
        self,
        *,
        status: str | None,
        limit: int,
        offset: int,
        school: str | None = None,
        grade: int | None = None,
        class_no: int | None = None,
    ) -> list[DraftRecord]:
        query = f"""
            {_SELECT}
            where {_CLASS_FILTER} and ($4::text is null or d.status = $4)
            order by s.school, s.grade, s.class_no, s.student_no
            limit $5 offset $6
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, school, grade, class_no, status, limit, offset)
        return [_to_record(r) for r in rows]

    async def count_by_status(
        self, *, school: str | None = None, grade: int | None = None, class_no: int | None = None
    ) -> dict[str, int]:
        """상태별 개수 — list_drafts와 같은 학교·학년·반 범위."""
        query = f"""
            select d.status, count(*) as n
            from generated.persona_drafts d
            join pii.students s on s.id = d.student_id
            where {_CLASS_FILTER}
            group by d.status
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, school, grade, class_no)
        counts = dict.fromkeys(DRAFT_STATUSES, 0)
        counts.update({r["status"]: r["n"] for r in rows})
        return counts

    async def list_issue(self, issue: str, *, limit: int) -> list[DraftRecord]:
        """재생성 대상 분류 하나 — 전체 학교, 학교·학년·반·번호 순."""
        query = f"""
            {_SELECT}
            where {DRAFT_ISSUES[issue]}
            order by s.school, s.grade, s.class_no, s.student_no
            limit $1
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, limit)
        return [_to_record(r) for r in rows]

    async def count_issues(self) -> dict[str, int]:
        cols = ", ".join(
            f"count(*) filter (where {cond}) as {k}" for k, cond in DRAFT_ISSUES.items()
        )
        query = f"""
            select {cols} from generated.persona_drafts d
            join pii.students s on s.id = d.student_id
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query)
        return dict(row) if row else dict.fromkeys(DRAFT_ISSUES, 0)

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

    async def verdict_progress(self) -> list[VerdictProgress]:
        """학교·학년·반별 가입·설문 진행·초안·평가 수. 개인 참여자는 school=''·0학년 0반."""
        query = """
            select s.school, s.grade, s.class_no,
                   count(*) as registered,
                   count(*) filter (where ls.status = 'completed') as completed,
                   count(*) filter (where ls.status is not null
                                      and ls.status <> 'completed') as in_progress,
                   count(*) filter (where ls.status is null) as not_started,
                   count(d.student_id) as drafts,
                   count(*) filter (where d.verdict = 'o') as o,
                   count(*) filter (where d.verdict = 'triangle') as triangle,
                   count(*) filter (where d.verdict = 'x') as x
            from pii.students s
            -- 학생별 최근 세션·최근 초안. lateral(학생마다 하위 쿼리)보다 한 번 훑는 편이
            -- 훨씬 빠르다(5천 명 기준 수 초 → 0.1초 미만).
            left join (
                select distinct on (student_id) student_id, status from generated.sessions
                order by student_id, created_at desc
            ) ls on ls.student_id = s.id
            left join (
                select distinct on (student_id) student_id, verdict
                from generated.persona_drafts
                order by student_id, created_at desc
            ) d on d.student_id = s.id
            where s.deleted_at is null and s.kind in ('student', 'guest')
            group by s.school, s.grade, s.class_no
            order by s.school, s.grade, s.class_no
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [VerdictProgress(**dict(r)) for r in rows]

    async def set_verdict(self, draft_id: UUID, verdict: str | None, reason: str) -> None:
        """O/X/△ 평가. status와 별개 — 카드 확정에 영향 없음. None이면 평가 취소."""
        query = """
            update generated.persona_drafts
            set verdict = $2, verdict_reason = $3,
                verdict_at = case when $2::text is null then null else now() end
            where id = $1
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, draft_id, verdict, reason)

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
                     source_career_pool, pool_extended, image_key, keywords, approved_at)
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
                on conflict (session_id) do update set
                    name = excluded.name, tagline = excluded.tagline,
                    keywords = excluded.keywords,
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
                # 역량 3개(codex 출력)가 확정본의 키워드. v40 키, 없으면 v1 시절 초안의 키.
                json.dumps(
                    draft.raw.get("career_required_competencies")
                    or draft.raw.get("competencies")
                    or [],
                    ensure_ascii=False,
                ),
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
