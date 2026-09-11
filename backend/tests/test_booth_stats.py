"""부스별 참여인원 집계 — fake 방문 리포지토리로 서비스·라우터를 검증한다."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_booth_visit_service
from app.main import create_app
from app.repositories.booth_visit_repo import BoothVisitCountRow
from app.services.booth_visit_service import BoothVisitService

_BOOTH_A = uuid4()
_BOOTH_B = uuid4()
_BOOTH_EMPTY = uuid4()


class FakeVisitStatsRepo:
    """BoothVisitRepository 중 집계 메서드만 흉내내는 대역."""

    def __init__(self, rows: list[BoothVisitCountRow], unique: int) -> None:
        self.rows = rows
        self.unique = unique

    async def count_by_booth(self) -> list[BoothVisitCountRow]:
        return self.rows

    async def count_unique_students(self) -> int:
        return self.unique


def _rows() -> list[BoothVisitCountRow]:
    return [
        BoothVisitCountRow(
            booth_id=_BOOTH_A, code="A3K9QZ", name="AI 체험", zone="F", visit_count=87
        ),
        BoothVisitCountRow(
            booth_id=_BOOTH_B, code="M2P4XW", name="로봇 부스", zone="C", visit_count=61
        ),
        # 아무도 찍지 않은 부스도 0으로 나와야 한다(left join). 존을 모르는 부스는 ''.
        BoothVisitCountRow(
            booth_id=_BOOTH_EMPTY, code="Z9Q1RT", name="빈 부스", zone="", visit_count=0
        ),
    ]


def _service(unique: int = 100) -> BoothVisitService:
    repo = FakeVisitStatsRepo(_rows(), unique)
    # 집계는 visits 리포지토리만 쓰므로 booths·sessions는 필요 없다.
    return BoothVisitService(booths=None, visits=repo, sessions=None)  # type: ignore[arg-type]


async def test_stats_sums_visits_and_keeps_empty_booths() -> None:
    result = await _service().stats()
    assert [b.visit_count for b in result.booths] == [87, 61, 0]
    assert result.total_visits == 148


async def test_stats_reports_unique_students_separately() -> None:
    """연인원(total_visits)과 실인원(unique_students)은 다른 값이다."""
    result = await _service(unique=100).stats()
    assert result.total_visits == 148
    assert result.unique_students == 100


async def test_stats_carries_booth_identity() -> None:
    result = await _service().stats()
    first = result.booths[0]
    assert first.booth_id == _BOOTH_A
    assert first.code == "A3K9QZ"
    assert first.name == "AI 체험"


def _build() -> object:
    app = create_app()
    app.dependency_overrides[get_booth_visit_service] = _service
    return app


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _auth(kind: TokenKind, subject: str) -> dict[str, str]:
    token = create_token(
        kind=kind, subject=subject, ttl=timedelta(hours=1), settings=get_settings()
    )
    return {"Authorization": f"Bearer {token}"}


async def test_stats_endpoint_allows_operator_and_admin() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for headers in (
            _auth(TokenKind.OPERATOR, "operator"),
            _auth(TokenKind.ADMIN, "admin"),
        ):
            res = await client.get("/api/admin/booths/stats", headers=headers)
            assert res.status_code == 200
            body = res.json()
            assert body["total_visits"] == 148
            assert len(body["booths"]) == 3
    finally:
        await gen.aclose()


async def test_stats_endpoint_rejects_student_token() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/booths/stats",
            headers=_auth(TokenKind.STUDENT, str(uuid4())),
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()
