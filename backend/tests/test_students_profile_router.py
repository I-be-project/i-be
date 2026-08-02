"""GET /api/students/me 통합 테스트 — 서비스에 fake 저장소 주입, 인증 override."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from app.config import get_settings
from app.deps import current_student, get_auth_service, get_session_service
from app.main import create_app
from app.repositories.card_repo import CardRecord
from app.services.auth_service import AuthService
from app.services.session_service import SessionService
from tests.test_auth_service import FakeStorage as AuthFakeStorage
from tests.test_auth_service import FakeStudentRepo as AuthFakeStudentRepo
from tests.test_auth_service import _register_kwargs
from tests.test_session_service import (
    FakeBoothRepo,
    FakeBoothVisitRepo,
    FakeCardRepo,
    FakeDBPool,
    FakePersonaRepo,
    FakeSessionRepo,
    FakeSettingsRepo,
    FakeStorage,
    FakeStudentRepo,
    _persona,
    _session,
    _student,
)


def _service(*, latest=None, persona=None, card=None, retry: object = False) -> SessionService:
    return SessionService(
        students=FakeStudentRepo(_student()),
        sessions=FakeSessionRepo(latest),
        personas=FakePersonaRepo(persona),
        cards=FakeCardRepo(card),
        settings_repo=FakeSettingsRepo(retry),
        storage=FakeStorage(),
        settings=get_settings(),
        db_pool=FakeDBPool(),
        booths=FakeBoothRepo(),
        visits=FakeBoothVisitRepo(),
    )


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _app_with(service: SessionService):
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    app.dependency_overrides[current_student] = lambda: uuid4()
    return app


async def test_me_with_no_session_returns_not_completed() -> None:
    app = _app_with(_service(latest=None))
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/students/me")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body == {
            "has_completed": False,
            "retry_enabled": False,
            "student": {
                "school": "한마당고",
                "grade": 2,
                "class_no": 3,
                "student_no": 11,
                "name": "홍길동",
                "gender": "male",
                "photo_url": None,
            },
            "persona": None,
            "card": None,
            "booths": [],
        }
    finally:
        await gen.aclose()


async def test_me_completed_with_card() -> None:
    persona = _persona()
    card = CardRecord(
        id=uuid4(),
        persona_id=persona.id,
        card_image_key="cards/xyz.png",
        created_at=datetime.now(UTC),
    )
    app = _app_with(_service(latest=_session("completed"), persona=persona, card=card, retry=True))
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/students/me")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["has_completed"] is True
        assert body["retry_enabled"] is True
        assert body["persona"]["name"] == persona.name
        assert body["card"]["card_image_url"].endswith("cards/xyz.png?ttl=86400")
    finally:
        await gen.aclose()


async def test_me_requires_auth() -> None:
    # current_student를 override하지 않으면 Authorization 없는 요청은 401.
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: _service(latest=None)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/students/me")
        assert res.status_code == 401
    finally:
        await gen.aclose()


def _app_with_auth(repo: AuthFakeStudentRepo, session_service: SessionService):
    """AuthService(전체 StudentRepo)와 SessionService가 같은 repo 인스턴스를 공유하는 앱.

    PATCH /me는 AuthService로 갱신하고 SessionService.get_profile_summary로 응답을
    구성하므로, 두 서비스가 같은 학생 레코드를 봐야 갱신 결과가 응답에 반영된다.
    """
    auth_service = AuthService(students=repo, storage=AuthFakeStorage(), settings=get_settings())
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: auth_service
    app.dependency_overrides[get_session_service] = lambda: session_service
    return app


async def test_patch_me_updates_name_and_gender() -> None:
    repo = AuthFakeStudentRepo()
    student, _ = await AuthService(
        students=repo, storage=AuthFakeStorage(), settings=get_settings()
    ).register_student(**_register_kwargs())

    session_service = SessionService(
        students=repo,
        sessions=FakeSessionRepo(None),
        personas=FakePersonaRepo(None),
        cards=FakeCardRepo(None),
        settings_repo=FakeSettingsRepo(False),
        storage=FakeStorage(),
        settings=get_settings(),
        db_pool=FakeDBPool(),
        booths=FakeBoothRepo(),
        visits=FakeBoothVisitRepo(),
    )
    app = _app_with_auth(repo, session_service)
    app.dependency_overrides[current_student] = lambda: student.id
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch("/api/students/me", json={"name": "새이름", "gender": "female"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["student"]["name"] == "새이름"
        assert body["student"]["gender"] == "female"
        # 로그인 식별 키는 이 API로 바뀌지 않는다.
        assert body["student"]["school"] == student.school
    finally:
        await gen.aclose()


async def test_patch_me_empty_payload_rejected() -> None:
    repo = AuthFakeStudentRepo()
    student, _ = await AuthService(
        students=repo, storage=AuthFakeStorage(), settings=get_settings()
    ).register_student(**_register_kwargs())

    session_service = SessionService(
        students=repo,
        sessions=FakeSessionRepo(None),
        personas=FakePersonaRepo(None),
        cards=FakeCardRepo(None),
        settings_repo=FakeSettingsRepo(False),
        storage=FakeStorage(),
        settings=get_settings(),
        db_pool=FakeDBPool(),
        booths=FakeBoothRepo(),
        visits=FakeBoothVisitRepo(),
    )
    app = _app_with_auth(repo, session_service)
    app.dependency_overrides[current_student] = lambda: student.id
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch("/api/students/me", json={})
        assert res.status_code == 422
    finally:
        await gen.aclose()


async def test_patch_me_requires_auth() -> None:
    repo = AuthFakeStudentRepo()
    session_service = SessionService(
        students=repo,
        sessions=FakeSessionRepo(None),
        personas=FakePersonaRepo(None),
        cards=FakeCardRepo(None),
        settings_repo=FakeSettingsRepo(False),
        storage=FakeStorage(),
        settings=get_settings(),
        db_pool=FakeDBPool(),
        booths=FakeBoothRepo(),
        visits=FakeBoothVisitRepo(),
    )
    app = _app_with_auth(repo, session_service)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch("/api/students/me", json={"name": "새이름"})
        assert res.status_code == 401
    finally:
        await gen.aclose()
