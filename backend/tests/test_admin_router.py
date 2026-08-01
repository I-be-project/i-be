"""/api/admin 통합 테스트 — fake 저장소/스토리지 주입, 실 DB·S3 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

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
        kind=TokenKind.ADMIN,
        subject="admin",
        ttl=timedelta(hours=1),
        settings=settings,
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
            kind=TokenKind.STUDENT,
            subject="00000000-0000-0000-0000-000000000000",
            ttl=timedelta(hours=1),
            settings=get_settings(),
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
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        gender="male",
        consent_privacy=True,
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


async def test_students_sort_by_name_orders_alphabetically() -> None:
    app, repo, _, _ = _build()
    for i, name in enumerate(("다현", "가은", "나연")):
        await repo.create(
            school="한마당고",
            grade=1,
            class_no=1,
            student_no=i + 1,
            name=name,
            password="20100101",
            gender="female",
            consent_privacy=True,
        )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students?sort=name_asc",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        names = [it["name"] for it in res.json()["items"]]
        assert names == ["가은", "나연", "다현"]
    finally:
        await gen.aclose()


async def test_students_pagination_limit_offset() -> None:
    app, repo, _, _ = _build()
    for i in range(5):
        await repo.create(
            school="한마당고",
            grade=1,
            class_no=1,
            student_no=i + 1,
            name=f"학생{i}",
            password="20100101",
            gender="male",
            consent_privacy=True,
        )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students?limit=2&offset=2&sort=name_asc",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        # total은 필터 전체 개수, items는 페이지 조각.
        assert body["total"] == 5
        assert [it["name"] for it in body["items"]] == ["학생2", "학생3"]
    finally:
        await gen.aclose()


async def test_schools_returns_distinct_sorted_and_requires_token() -> None:
    app, repo, _, _ = _build()
    for i, school in enumerate(("나로고", "가온고", "나로고")):
        await repo.create(
            school=school,
            grade=1,
            class_no=1,
            student_no=i + 1,
            name=f"학생{i}",
            password="20100101",
            gender="male",
            consent_privacy=True,
        )
    gen = _client(app)
    client = await anext(gen)
    try:
        # 토큰 없으면 401.
        res = await client.get("/api/admin/students/schools")
        assert res.status_code == 401

        res = await client.get(
            "/api/admin/students/schools",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        assert res.json() == ["가온고", "나로고"]
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
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        gender="male",
        consent_privacy=True,
    )
    from datetime import UTC, datetime
    from uuid import uuid4

    from app.repositories.session_repo import SessionContent, SessionPersona

    now = datetime.now(UTC)
    sessions.contents[student.id] = [
        SessionContent(
            id=uuid4(),
            status="completed",
            created_at=now,
            completed_at=now,
            answers=[],
            persona=SessionPersona("탐험가", "새로움", ["호기심"], ["과학"]),
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
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        gender="male",
        consent_privacy=True,
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


async def test_list_students_include_photo_false_returns_null_urls() -> None:
    app, repo, storage, _ = _build()
    student = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=1,
        name="김영희",
        password="20110202",
        gender="female",
        consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students?include_photo=false",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        item = res.json()["items"][0]
        assert item["photo_url"] is None
        assert item["has_photo"] is True
        assert storage.batch_sign_calls == 0
    finally:
        await gen.aclose()


async def test_list_students_default_includes_photo_url() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=1,
        name="김영희",
        password="20110202",
        gender="female",
        consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        item = res.json()["items"][0]
        # 외부 계약: 파라미터 없이 부르면 photo_url이 그대로 온다.
        assert item["photo_url"] is not None
        assert item["has_photo"] is True
    finally:
        await gen.aclose()


async def test_student_photo_url_returns_signed_url() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=1,
        name="김영희",
        password="20110202",
        gender="female",
        consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{student.id}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        assert res.json()["photo_url"].startswith("https://signed.example/")
    finally:
        await gen.aclose()


async def test_student_photo_url_null_when_no_photo() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=2,
        name="홍길동",
        password="20100101",
        gender="male",
        consent_privacy=True,
    )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{student.id}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        # 사진이 없는 것은 정상 상태다 — 404가 아니라 200 + null.
        assert res.status_code == 200
        assert res.json()["photo_url"] is None
    finally:
        await gen.aclose()


async def test_student_photo_url_404_for_unknown_student() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{uuid4()}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 404
    finally:
        await gen.aclose()
