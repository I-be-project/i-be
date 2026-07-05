"""/api/admin 통합 테스트 — fake 저장소/스토리지 주입, 실 DB·S3 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_admin_service
from app.main import create_app
from app.services.admin_service import AdminService
from tests.test_admin_service import FakeSessionRepo
from tests.test_auth_service import FakeStorage, FakeStudentRepo


def _build() -> tuple[object, FakeStudentRepo, FakeStorage, FakeSessionRepo]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    sessions = FakeSessionRepo()
    service = AdminService(
        students=repo, sessions=sessions, storage=storage, settings=get_settings()
    )
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: service
    return app, repo, storage, sessions


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_login_success_returns_admin_token() -> None:
    settings = get_settings()
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert res.status_code == 200, res.text
        assert res.json()["admin_token"]
    finally:
        await gen.aclose()


async def test_login_wrong_credentials_unauthorized() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "definitely-wrong"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


def _admin_token() -> str:
    settings = get_settings()
    from datetime import timedelta

    return create_token(
        kind=TokenKind.ADMIN, subject="admin",
        ttl=timedelta(hours=1), settings=settings,
    )


async def test_students_requires_admin_token() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/students")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_rejects_student_token() -> None:
    from datetime import timedelta

    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        student_tok = create_token(
            kind=TokenKind.STUDENT, subject="00000000-0000-0000-0000-000000000000",
            ttl=timedelta(hours=1), settings=get_settings(),
        )
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {student_tok}"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_lists_with_admin_token() -> None:
    app, repo, _, _ = _build()
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "홍길동"
        assert body["items"][0]["password"] == "20100101"
        # 진행도 필드가 항상 포함되며, 세션 없으면 not_started.
        assert body["items"][0]["progress"]["status"] == "not_started"
    finally:
        await gen.aclose()


async def test_student_detail_requires_admin_token() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/students/00000000-0000-0000-0000-000000000001")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_student_detail_returns_content() -> None:
    app, repo, _, sessions = _build()
    student = await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    from datetime import UTC, datetime
    from uuid import uuid4

    from app.repositories.session_repo import SessionContent, SessionPersona

    now = datetime.now(UTC)
    sessions.contents[student.id] = [
        SessionContent(
            id=uuid4(), status="completed", created_at=now, completed_at=now,
            answers=[], persona=SessionPersona("탐험가", "새로움", ["호기심"], ["과학"]),
            card_image_key=None,
        )
    ]
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{student.id}",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "홍길동"
        assert body["sessions"][0]["persona"]["name"] == "탐험가"
    finally:
        await gen.aclose()


async def test_student_detail_missing_returns_404() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students/00000000-0000-0000-0000-000000000009",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 404
    finally:
        await gen.aclose()


async def test_delete_student_removes_and_requires_token() -> None:
    app, repo, storage, _ = _build()
    student = await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        # 토큰 없으면 401.
        res = await client.delete(f"/api/admin/students/{student.id}")
        assert res.status_code == 401

        # admin 토큰으로 삭제 성공.
        res = await client.delete(
            f"/api/admin/students/{student.id}",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["removed_storage_objects"] == 1
        assert "uploads/photos/x/photo" in storage.deleted

        # 삭제 후 목록에서 사라짐.
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.json()["total"] == 0
    finally:
        await gen.aclose()
