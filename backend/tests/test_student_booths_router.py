"""/api/booths 통합 테스트 — fake 리포지토리 주입, 실 DB 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_booth_visit_service
from app.main import create_app
from app.services.booth_visit_service import BoothVisitService
from tests.test_booth_service import FakeBoothRepo
from tests.test_booth_visit_service import FakeBoothVisitRepo, FakeSessionRepo

_CODE = "YP7PHR"


def _build(*, completed: bool = True) -> tuple[object, FakeBoothRepo, FakeBoothVisitRepo]:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    # 세 Fake는 각 리포지토리의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    service = BoothVisitService(
        booths=booths,  # type: ignore[arg-type]
        visits=visits,  # type: ignore[arg-type]
        sessions=FakeSessionRepo(completed=completed),  # type: ignore[arg-type]
    )
    app = create_app()
    app.dependency_overrides[get_booth_visit_service] = lambda: service
    return app, booths, visits


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _student_auth(student_id: str | None = None) -> dict[str, str]:
    token = create_token(
        kind=TokenKind.STUDENT,
        subject=student_id or str(uuid4()),
        ttl=timedelta(hours=1),
        settings=get_settings(),
    )
    return {"Authorization": f"Bearer {token}"}


def _admin_auth() -> dict[str, str]:
    token = create_token(
        kind=TokenKind.ADMIN,
        subject="admin",
        ttl=timedelta(hours=1),
        settings=get_settings(),
    )
    return {"Authorization": f"Bearer {token}"}


async def _seed(booths: FakeBoothRepo) -> None:
    await booths.create(code=_CODE, name="드론 체험", description="드론을 직접 조종해보는 부스")


async def test_get_requires_student_token() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(f"/api/booths/{_CODE}")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_get_rejects_admin_token() -> None:
    """학생 토큰과 같은 JWT_SECRET으로 서명되지만 kind가 다른 관리자 토큰은 거부된다."""
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(f"/api/booths/{_CODE}", headers=_admin_auth())
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_visit_requires_student_token() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(f"/api/booths/{_CODE}/visit")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_visit_rejects_admin_token() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(f"/api/booths/{_CODE}/visit", headers=_admin_auth())
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_get_returns_booth_without_admin_fields() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(f"/api/booths/{_CODE}", headers=_student_auth())
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["code"] == _CODE
        assert body["name"] == "드론 체험"
        assert body["visited"] is False
        # 학생 응답에는 관리자용 식별자·QR 링크를 섞지 않는다.
        assert "id" not in body
        assert "qr_url" not in body
    finally:
        await gen.aclose()


async def test_get_unknown_code_returns_404() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/booths/AAAAAA", headers=_student_auth())
        assert res.status_code == 404
    finally:
        await gen.aclose()


async def test_get_before_card_returns_403() -> None:
    """카드 발급 전인 학생은 403 — 프론트가 '탐험 먼저' 안내로 분기한다."""
    app, booths, _ = _build(completed=False)
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(f"/api/booths/{_CODE}", headers=_student_auth())
        assert res.status_code == 403
    finally:
        await gen.aclose()


async def test_visit_records_and_is_visible_on_get() -> None:
    app, booths, visits = _build()
    await _seed(booths)
    student_id = str(uuid4())
    auth = _student_auth(student_id)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(f"/api/booths/{_CODE}/visit", headers=auth)
        assert res.status_code == 200, res.text
        assert res.json()["already_visited"] is False
        assert len(visits.rows) == 1

        after = await client.get(f"/api/booths/{_CODE}", headers=auth)
        assert after.json()["visited"] is True
    finally:
        await gen.aclose()


async def test_visit_twice_returns_already_visited() -> None:
    app, booths, visits = _build()
    await _seed(booths)
    auth = _student_auth(str(uuid4()))
    gen = _client(app)
    client = await anext(gen)
    try:
        first = await client.post(f"/api/booths/{_CODE}/visit", headers=auth)
        second = await client.post(f"/api/booths/{_CODE}/visit", headers=auth)

        assert second.status_code == 200, second.text
        assert second.json()["already_visited"] is True
        assert second.json()["visited_at"] == first.json()["visited_at"]
        assert len(visits.rows) == 1
    finally:
        await gen.aclose()


async def test_visit_before_card_returns_403_and_records_nothing() -> None:
    app, booths, visits = _build(completed=False)
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(f"/api/booths/{_CODE}/visit", headers=_student_auth())
        assert res.status_code == 403
        assert visits.rows == {}
    finally:
        await gen.aclose()


async def test_visit_unknown_code_returns_404() -> None:
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/booths/AAAAAA/visit", headers=_student_auth())
        assert res.status_code == 404
    finally:
        await gen.aclose()


async def test_lowercase_code_in_url_resolves() -> None:
    """기본 카메라 앱이 링크를 소문자로 넘겨도 같은 부스로 이어진다."""
    app, booths, _ = _build()
    await _seed(booths)
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(f"/api/booths/{_CODE.lower()}", headers=_student_auth())
        assert res.status_code == 200, res.text
        assert res.json()["code"] == _CODE
    finally:
        await gen.aclose()
