"""/api/admin/reviews — 초안 O/X/△ 평가. fake 저장소, 실 DB·S3 없음."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_draft_repo, get_storage_client
from app.main import create_app
from app.repositories.draft_repo import DraftRecord, VerdictProgress


def _record() -> DraftRecord:
    return DraftRecord(
        id=uuid4(),
        session_id=uuid4(),
        student_id=uuid4(),
        status="pending",
        name="하늘을 나는 드론 전문가",
        base_career="드론 전문가",
        headline="하늘을 나는",
        tagline="설명",
        source_career_pool=None,
        pool_extended=None,
        raw={},
        image_key="gen/a.png",
        error=None,
        note="",
        updated_at=datetime.now(UTC),
        reviewed_at=None,
        verdict=None,
        verdict_reason="",
        regenerated_at=None,
        prev_verdict=None,
        prev_verdict_reason="",
        student_name="홍길동",
        school="한빛중",
        grade=2,
        class_no=3,
        student_no=1,
        photo_key="photos/a.jpg",
    )


class _Drafts:
    def __init__(self, record: DraftRecord | None) -> None:
        self.record = record
        self.list_calls: list[dict[str, object]] = []

    async def get(self, draft_id: UUID) -> DraftRecord | None:
        return self.record if self.record and self.record.id == draft_id else None

    async def list_drafts(self, **kwargs: object) -> list[DraftRecord]:
        self.list_calls.append(kwargs)
        return [self.record] if self.record else []

    async def verdict_progress(self) -> list[VerdictProgress]:
        return [
            VerdictProgress(
                "한빛중",
                2,
                3,
                registered=20,
                completed=18,
                in_progress=1,
                not_started=1,
                drafts=18,
                o=5,
                triangle=2,
                x=1,
            )
        ]

    async def set_verdict(self, draft_id: UUID, verdict: str | None, reason: str) -> None:
        assert self.record is not None
        self.record = replace(self.record, verdict=verdict, verdict_reason=reason)


class _Storage:
    async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
        return {k: f"https://signed.example/{k}" for k in keys}


def _client(drafts: _Drafts) -> httpx.AsyncClient:
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: drafts
    app.dependency_overrides[get_storage_client] = lambda: _Storage()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def _auth() -> dict[str, str]:
    token = create_token(
        kind=TokenKind.ADMIN, subject="admin", ttl=timedelta(hours=1), settings=get_settings()
    )
    return {"Authorization": f"Bearer {token}"}


_SCOPE = {"school": "한빛중", "grade": 2, "class_no": 3}


async def test_reviews_require_admin_token() -> None:
    async with _client(_Drafts(_record())) as client:
        res = await client.get("/api/admin/reviews", params=_SCOPE)
    assert res.status_code == 401


async def test_list_reviews_scoped_to_class_with_urls() -> None:
    drafts = _Drafts(_record())
    async with _client(drafts) as client:
        res = await client.get("/api/admin/reviews", params=_SCOPE, headers=_auth())

    assert res.status_code == 200, res.text
    assert drafts.list_calls == [{"status": None, "limit": 500, "offset": 0, **_SCOPE}]
    item = res.json()[0]
    assert item["image_url"] == "https://signed.example/gen/a.png"
    assert item["verdict"] is None


async def test_set_triangle_with_reason_then_clear() -> None:
    record = _record()
    drafts = _Drafts(record)
    async with _client(drafts) as client:
        res = await client.put(
            f"/api/admin/reviews/{record.id}",
            json={"verdict": "triangle", "reason": "  직업명이 어색함 "},
            headers=_auth(),
        )
        assert res.status_code == 200, res.text
        assert res.json()["verdict"] == "triangle"
        assert res.json()["verdict_reason"] == "직업명이 어색함"

        res = await client.put(
            f"/api/admin/reviews/{record.id}", json={"verdict": None}, headers=_auth()
        )
        assert res.json()["verdict"] is None


async def test_set_review_rejects_unknown_verdict_and_draft() -> None:
    record = _record()
    async with _client(_Drafts(record)) as client:
        bad = await client.put(
            f"/api/admin/reviews/{record.id}", json={"verdict": "maybe"}, headers=_auth()
        )
        missing = await client.put(
            f"/api/admin/reviews/{uuid4()}", json={"verdict": "o"}, headers=_auth()
        )
    assert bad.status_code == 422
    assert missing.status_code == 404


async def test_review_progress_per_class() -> None:
    async with _client(_Drafts(None)) as client:
        res = await client.get("/api/admin/reviews/progress", headers=_auth())
    assert res.status_code == 200, res.text
    assert res.json() == [
        {
            "school": "한빛중",
            "grade": 2,
            "class_no": 3,
            "registered": 20,
            "completed": 18,
            "in_progress": 1,
            "not_started": 1,
            "drafts": 18,
            "o": 5,
            "triangle": 2,
            "x": 1,
        }
    ]


async def test_list_reviews_accepts_guest_group() -> None:
    """개인 참여자는 school=''·0학년 0반으로 묶여 있다 — 422가 아니라 그 묶음을 조회."""
    drafts = _Drafts(None)
    guest = {"school": "", "grade": 0, "class_no": 0}
    async with _client(drafts) as client:
        res = await client.get("/api/admin/reviews", params=guest, headers=_auth())
    assert res.status_code == 200, res.text
    assert drafts.list_calls == [{"status": None, "limit": 500, "offset": 0, **guest}]
