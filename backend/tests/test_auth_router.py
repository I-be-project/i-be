"""/api/auth · /api/students/me/photo 통합 테스트.

AuthService를 fake 저장소/스토리지로 구성해 주입하고, current_student는 override한다.
DB·Storage·lifespan 없이 라우터 ↔ 서비스 결선만 검증한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

import httpx
import pytest

from app.config import get_settings
from app.deps import current_student, get_auth_service
from app.main import create_app
from app.services.auth_service import AuthService
from tests.test_auth_service import FakeStorage, FakeStudentRepo

_REGISTER_BODY = {
    "school": "한마당고",
    "grade": 2,
    "class_no": 3,
    "student_no": 11,
    "name": "홍길동",
    "password": "20100101",
    "consent_privacy": True,
}


def _build() -> tuple[object, AuthService, FakeStorage]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    service = AuthService(students=repo, storage=storage, settings=get_settings())
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: service
    return app, service, storage


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_register_then_login() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/auth/register", json=_REGISTER_BODY)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["student_token"]
        UUID(body["student_id"])  # 유효한 UUID

        res = await client.post(
            "/api/auth/login",
            json={
                "school": "한마당고",
                "grade": 2,
                "class_no": 3,
                "student_no": 11,
                "password": "20100101",
            },
        )
        assert res.status_code == 200, res.text
        assert res.json()["student_id"] == body["student_id"]
    finally:
        await gen.aclose()


async def test_register_without_consent_is_forbidden() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/auth/register", json={**_REGISTER_BODY, "consent_privacy": False}
        )
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "forbidden"
    finally:
        await gen.aclose()


async def test_register_duplicate_conflicts() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        await client.post("/api/auth/register", json=_REGISTER_BODY)
        res = await client.post("/api/auth/register", json=_REGISTER_BODY)
        assert res.status_code == 409
        assert res.json()["error"]["code"] == "conflict"
    finally:
        await gen.aclose()


async def test_login_wrong_password_unauthorized() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        await client.post("/api/auth/register", json=_REGISTER_BODY)
        res = await client.post(
            "/api/auth/login",
            json={
                "school": "한마당고",
                "grade": 2,
                "class_no": 3,
                "student_no": 11,
                "password": "nope",
            },
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_photo_upload_links_key() -> None:
    app, _, storage = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        reg = await client.post("/api/auth/register", json=_REGISTER_BODY)
        student_id = UUID(reg.json()["student_id"])
        app.dependency_overrides[current_student] = lambda: student_id  # type: ignore[attr-defined]

        res = await client.post(
            "/api/students/me/photo",
            files={"file": ("photo.jpg", b"jpegbytes", "image/jpeg")},
        )
        assert res.status_code == 200, res.text
        assert res.json()["photo_key"] == f"photos/{student_id}/photo"
        assert storage.uploads and storage.uploads[0][2] == "image/jpeg"
    finally:
        await gen.aclose()


async def test_photo_upload_rejects_bad_content_type() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        reg = await client.post("/api/auth/register", json=_REGISTER_BODY)
        student_id = UUID(reg.json()["student_id"])
        app.dependency_overrides[current_student] = lambda: student_id  # type: ignore[attr-defined]

        res = await client.post(
            "/api/students/me/photo",
            files={"file": ("note.txt", b"hello", "text/plain")},
        )
        assert res.status_code == 400
    finally:
        await gen.aclose()


async def test_photo_upload_requires_auth() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/students/me/photo",
            files={"file": ("photo.jpg", b"jpegbytes", "image/jpeg")},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


@pytest.mark.parametrize("path", ["/api/auth/refresh"])
async def test_refresh_requires_auth(path: str) -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(path)
        assert res.status_code == 401
    finally:
        await gen.aclose()
