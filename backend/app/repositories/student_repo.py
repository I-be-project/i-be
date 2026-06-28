"""pii.students 접근.

식별 키 (school, grade, class_no, student_no)로 학생을 조회·생성한다.
소프트 삭제된(deleted_at IS NOT NULL) 레코드는 조회·유니크 대상에서 제외한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.errors import ConflictError
from app.repositories.base import BaseRepository

_COLUMNS = (
    "id, school, grade, class_no, student_no, name, "
    "password, photo_key, consent_privacy, created_at, deleted_at"
)


@dataclass(frozen=True, slots=True)
class StudentRecord:
    """pii.students 한 행."""

    id: UUID
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    password: str  # 평문 저장 (정책상 해시하지 않음)
    photo_key: str | None
    consent_privacy: bool
    created_at: datetime
    deleted_at: datetime | None


def _to_record(row: asyncpg.Record) -> StudentRecord:
    return StudentRecord(
        id=row["id"],
        school=row["school"],
        grade=row["grade"],
        class_no=row["class_no"],
        student_no=row["student_no"],
        name=row["name"],
        password=row["password"],
        photo_key=row["photo_key"],
        consent_privacy=row["consent_privacy"],
        created_at=row["created_at"],
        deleted_at=row["deleted_at"],
    )


class StudentRepository(BaseRepository):
    async def create(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
        name: str,
        password: str,
        consent_privacy: bool,
    ) -> StudentRecord:
        """학생 1명 생성 후 저장된 레코드 반환.

        password는 평문으로 저장한다(정책상 해시하지 않음).
        식별 키 중복 시 ConflictError (살아있는 레코드 기준 유니크 인덱스 위반).
        """
        query = f"""
            insert into pii.students (
                school, grade, class_no, student_no, name, password, consent_privacy
            )
            values ($1, $2, $3, $4, $5, $6, $7)
            returning {_COLUMNS}
        """
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    query,
                    school,
                    grade,
                    class_no,
                    student_no,
                    name,
                    password,
                    consent_privacy,
                )
        except asyncpg.UniqueViolationError as exc:
            raise ConflictError(
                "이미 등록된 학생입니다.",
                details={
                    "school": school,
                    "grade": grade,
                    "class_no": class_no,
                    "student_no": student_no,
                },
            ) from exc

        assert row is not None  # RETURNING 이므로 항상 한 행
        return _to_record(row)

    async def get_by_login_key(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
    ) -> StudentRecord | None:
        """식별 키로 살아있는 학생 조회. 없으면 None."""
        query = f"""
            select {_COLUMNS}
            from pii.students
            where school = $1
              and grade = $2
              and class_no = $3
              and student_no = $4
              and deleted_at is null
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, school, grade, class_no, student_no)
        return _to_record(row) if row is not None else None

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None:
        """id로 살아있는 학생 조회. 없으면 None."""
        query = f"""
            select {_COLUMNS}
            from pii.students
            where id = $1
              and deleted_at is null
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, student_id)
        return _to_record(row) if row is not None else None

    async def update_photo_key(self, student_id: UUID, photo_key: str) -> None:
        """학생의 photo_key 갱신. 대상이 없으면 NotFoundError 대신 조용히 통과하지 않도록
        서비스 레이어에서 학생 존재를 보장한다(여기서는 단순 UPDATE)."""
        query = """
            update pii.students
            set photo_key = $2
            where id = $1
              and deleted_at is null
        """
        async with self._pool.acquire() as conn:
            await conn.execute(query, student_id, photo_key)

    async def list_students(
        self,
        *,
        q: str | None,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        limit: int,
        offset: int,
    ) -> tuple[int, list[StudentRecord]]:
        """관리자용 목록 — soft-delete 제외, 필터 AND 결합, (학교,학년,반,번호) 정렬.

        반환: (조건에 맞는 전체 개수, 현재 페이지 레코드 목록).
        """
        conditions = ["deleted_at is null"]
        params: list[object] = []

        def _add(expr: str, value: object) -> None:
            params.append(value)
            conditions.append(expr.format(n=len(params)))

        if q:
            _add("name ilike '%' || ${n} || '%'", q)
        if school:
            _add("school = ${n}", school)
        if grade is not None:
            _add("grade = ${n}", grade)
        if class_no is not None:
            _add("class_no = ${n}", class_no)

        where = " and ".join(conditions)
        count_query = f"select count(*) from pii.students where {where}"
        list_query = f"""
            select {_COLUMNS}
            from pii.students
            where {where}
            order by school, grade, class_no, student_no
            limit ${len(params) + 1} offset ${len(params) + 2}
        """
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(count_query, *params)
            rows = await conn.fetch(list_query, *params, limit, offset)
        return int(total), [_to_record(row) for row in rows]

    # 데이터 삭제(soft delete + 사진 폐기)는 다른 작업 영역 — 인터페이스만 유지.
    async def soft_delete(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def clear_photo(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
