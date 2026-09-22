"""실제 repository DELETE를 메모리 SQL DB에서 실행해 삭제 범위와 FK 연쇄 삭제 검증.

PostgreSQL 연결·S3를 사용하지 않는다. FK 구조는 generated 마이그레이션과 같다.
"""

import sqlite3
from contextlib import asynccontextmanager
from typing import Any, cast
from uuid import UUID, uuid4

from app.repositories.session_repo import SessionRepository


async def test_restart_deletes_only_owners_completed_results_and_dependents() -> None:
    db = sqlite3.connect(":memory:")
    try:
        db.execute("pragma foreign_keys = on")
        db.execute("attach database ':memory:' as generated")
        db.executescript("""
            create table generated.sessions (id text primary key, student_id text, status text);
            create table generated.answers (id text primary key, session_id text references sessions(id) on delete cascade);
            create table generated.personas (id text primary key, session_id text references sessions(id) on delete cascade);
            create table generated.cards (id text primary key, persona_id text references personas(id) on delete cascade);
        """)
        owner, other = uuid4(), uuid4()
        for sid, student, status in (
            ("old1", owner, "completed"),
            ("old2", owner, "completed"),
            ("pending", owner, "in_progress"),
            ("other", other, "completed"),
        ):
            db.execute(
                "insert into generated.sessions values (?, ?, ?)", (sid, str(student), status)
            )
            db.execute("insert into generated.answers values (?, ?)", (sid, sid))
            db.execute("insert into generated.personas values (?, ?)", (sid, sid))
            db.execute("insert into generated.cards values (?, ?)", (sid, sid))

        class Connection:
            async def execute(self, query: str, student_id: UUID) -> None:
                db.execute(query, {"1": str(student_id)})

        class Pool:
            @asynccontextmanager
            async def acquire(self):
                yield Connection()

        repo = SessionRepository(cast(Any, Pool()))
        await repo.delete_completed_for_student(owner)
        await repo.delete_completed_for_student(owner)
        for table in ("sessions", "answers", "personas", "cards"):
            rows = db.execute(f"select id from generated.{table} order by id").fetchall()
            assert rows == [("other",), ("pending",)]
    finally:
        db.close()
