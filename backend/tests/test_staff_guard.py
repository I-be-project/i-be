"""staff 가드 권한 경계 테스트 — 운영진 토큰은 조회만 되고 쓰기는 막혀야 한다."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_admin_service, get_booth_service
from app.main import create_app
from app.services.admin_service import AdminService
from app.services.booth_service import BoothService
from tests.test_admin_service import FakeSessionRepo
from tests.test_auth_service import FakeStorage, FakeStudentRepo
from tests.test_booth_service import FakeBoothRepo


def _build(students: FakeStudentRepo | None = None) -> object:
    # Fake들은 실제 리포지토리의 구조적 대역이다(DB 없이 같은 메서드만 제공).
    admin_service = AdminService(
        students=students or FakeStudentRepo(),
        sessions=FakeSessionRepo(),
        storage=FakeStorage(),
        settings=get_settings(),
    )
    booth_service = BoothService(booths=FakeBoothRepo(), settings=get_settings())  # type: ignore[arg-type]
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: admin_service
    app.dependency_overrides[get_booth_service] = lambda: booth_service
    return app


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _token(kind: TokenKind, subject: str) -> dict[str, str]:
    token = create_token(
        kind=kind, subject=subject, ttl=timedelta(hours=1), settings=get_settings()
    )
    return {"Authorization": f"Bearer {token}"}


def _operator() -> dict[str, str]:
    return _token(TokenKind.OPERATOR, "operator")


def _admin() -> dict[str, str]:
    return _token(TokenKind.ADMIN, "admin")


def _student() -> dict[str, str]:
    return _token(TokenKind.STUDENT, str(uuid4()))


# 운영진에게 열어야 하는 조회 엔드포인트.
_READ_PATHS = [
    "/api/admin/students",
    "/api/admin/students/schools",
    "/api/admin/progress/classes?school=한마당고",
    "/api/admin/booths",
]


async def test_operator_token_can_read() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_operator())
            assert res.status_code == 200, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_admin_token_still_can_read() -> None:
    """가드 교체가 관리자 경로를 깨뜨리지 않았는지 확인한다."""
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_admin())
            assert res.status_code == 200, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_operator_token_can_read_student_detail_and_photo_url() -> None:
    """/students/{id}, /students/{id}/photo-url — _READ_PATHS에 빠져 있던 경로.

    임의의 UUID는 존재하지 않는 학생이라 서비스가 404를 돌려주고, 그러면 401이
    아니라는 사실만으로는 가드를 통과했는지 우연히 404가 났는지 구분할 수 없다.
    학생을 실제로 시드해 200을 확인해야 가드가 진짜로 운영진을 들여보냈다는
    증거가 된다.
    """
    students = FakeStudentRepo()
    student = await students.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=1,
        name="시드학생",
        password="p",
        gender="male",
        consent_privacy=True,
    )
    app = _build(students)
    gen = _client(app)
    client = await anext(gen)
    try:
        detail = await client.get(f"/api/admin/students/{student.id}", headers=_operator())
        assert detail.status_code == 200, detail.text

        photo = await client.get(f"/api/admin/students/{student.id}/photo-url", headers=_operator())
        assert photo.status_code == 200, photo.text
    finally:
        await gen.aclose()


async def test_operator_token_cannot_delete_student() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.delete(f"/api/admin/students/{uuid4()}", headers=_operator())
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_operator_token_cannot_bulk_delete_students() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/students/bulk-delete",
            json={"ids": [str(uuid4())]},
            headers=_operator(),
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_operator_token_cannot_write_booths() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        created = await client.post(
            "/api/admin/booths", json={"name": "AI 체험"}, headers=_operator()
        )
        assert created.status_code == 401

        updated = await client.patch(
            f"/api/admin/booths/{uuid4()}", json={"name": "수정"}, headers=_operator()
        )
        assert updated.status_code == 401

        deleted = await client.delete(f"/api/admin/booths/{uuid4()}", headers=_operator())
        assert deleted.status_code == 401
    finally:
        await gen.aclose()


async def test_student_token_rejected_everywhere() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_student())
            assert res.status_code == 401, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_missing_token_rejected() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path)
            assert res.status_code == 401, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()
