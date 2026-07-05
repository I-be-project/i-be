"""POST /api/sessions/complete 통합 테스트 — fake 서비스 주입, 인증 override."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import httpx

from app.deps import current_student, get_session_service
from app.main import create_app


class FakeService:
    def __init__(self, *, conflict: bool = False) -> None:
        self.conflict = conflict
        self.calls: list[tuple] = []

    async def complete_survey(self, student_id, persona, session_id=None):
        from app.core.errors import ConflictError

        self.calls.append((student_id, persona, session_id))
        if self.conflict:
            raise ConflictError("이미 설문을 완료했습니다.")
        from app.schemas.students import PersonaSummary, ProfileSummary

        # persona 없이 완료(Q9가 마지막)면 프로필은 '완료 · 카드 준비 중'.
        summary = (
            None
            if persona is None
            else PersonaSummary(
                name=persona.name,
                tagline=persona.tagline,
                keywords=list(persona.keywords),
                fields=list(persona.fields),
            )
        )
        return ProfileSummary(
            has_completed=True,
            retry_enabled=False,
            student=None,
            persona=summary,
            card=None,
        )


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _app_with(service: FakeService):
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    app.dependency_overrides[current_student] = lambda: uuid4()
    return app


_BODY = {
    "name": "숲을 지키는 드론전문가",
    "tagline": "자연과 기술을 잇는 사람",
    "keywords": ["자연", "기술"],
    "fields": ["환경"],
}


async def test_complete_returns_profile_summary() -> None:
    service = FakeService()
    gen = _client(_app_with(service))
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["has_completed"] is True
        assert body["persona"]["name"] == "숲을 지키는 드론전문가"
        assert len(service.calls) == 1
    finally:
        await gen.aclose()


async def test_complete_without_persona_returns_profile_summary() -> None:
    # 학생 흐름은 Q9가 마지막 — 이름 없이 완료하면 persona=None으로 서비스가 호출된다.
    service = FakeService()
    gen = _client(_app_with(service))
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json={})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["has_completed"] is True
        assert body["persona"] is None
        assert len(service.calls) == 1
        # to_persona()가 None을 넘겼는지 확인.
        assert service.calls[0][1] is None
    finally:
        await gen.aclose()


async def test_complete_conflict_returns_409() -> None:
    gen = _client(_app_with(FakeService(conflict=True)))
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 409, res.text
        assert res.json()["error"]["code"] == "conflict"
    finally:
        await gen.aclose()


async def test_complete_requires_auth() -> None:
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: FakeService()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 401
    finally:
        await gen.aclose()
