"""/api/export/v1 — 조회 전용 키 인증, 페이지 커서, 응답 조립. fake 저장소, 실 DB·S3 없음."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx

from app.config import get_settings
from app.deps import get_booth_repo, get_booth_visit_repo, get_export_repo, get_storage_client
from app.main import create_app
from app.repositories.booth_repo import BoothRecord
from app.repositories.booth_visit_repo import BoothVisitRecord
from app.repositories.export_repo import ExportPersona, ExportRow
from app.repositories.session_repo import AnswerRecord

KEY = "test-export-key"
NOW = datetime.now(UTC)


def _row(*, session: bool = True, persona: bool = True) -> ExportRow:
    return ExportRow(
        id=uuid4(),
        kind="student",
        school="한빛중",
        grade=2,
        class_no=3,
        student_no=7,
        name="홍길동",
        gender="male",
        birth_date=None,
        consent_privacy=True,
        created_at=NOW,
        photo_key="photos/a.jpg",
        session_id=uuid4() if session else None,
        session_status="completed" if session else None,
        session_created_at=NOW if session else None,
        completed_at=NOW if session else None,
        persona=ExportPersona(
            name="하늘을 나는 드론 전문가",
            headline="하늘을 나는",
            base_career="드론 전문가",
            tagline="설명",
            competencies=["탐구", "협업", "설계"],
            image_key="gen/a.png",
            approved_at=NOW,
        )
        if persona
        else None,
    )


class _Repo:
    def __init__(self, rows: list[ExportRow]) -> None:
        self.rows = rows
        self.calls: list[tuple[UUID | None, int]] = []
        self.student_ids: list[UUID | None] = []

    async def page(
        self, *, after: UUID | None, limit: int, student_id: UUID | None = None
    ) -> tuple[list[ExportRow], dict[UUID, list[AnswerRecord]]]:
        self.calls.append((after, limit))
        self.student_ids.append(student_id)
        rows = [r for r in self.rows if student_id is None or r.id == student_id][:limit]
        answers = {
            r.session_id: [
                AnswerRecord(
                    id=uuid4(),
                    session_id=r.session_id,
                    stage="q8",
                    payload={"chips": ["사람을 돕는"], "freeText": "봉사하고 싶다"},
                    created_at=NOW,
                )
            ]
            for r in rows
            if r.session_id
        }
        return rows, answers


DRONE = BoothRecord(
    id=uuid4(),
    code="D1",
    name="드론 체험관",
    description="드론 회사",
    zone="F",
    created_at=NOW,
    updated_at=NOW,
    competencies=("creativity", "challenge"),
)
MAP = BoothRecord(
    id=uuid4(),
    code="M1",
    name="지도 만들기",
    description=None,
    zone="L",
    created_at=NOW,
    updated_at=NOW,
    competencies=("creativity",),
)


class _Booths:
    async def list_all(self) -> list[BoothRecord]:
        return [DRONE, MAP]


class _Visits:
    """요청한 학생 중 첫 번째만 방문 기록이 있다 — MAP을 먼저, DRONE을 나중에.
    지워진 부스 방문 1건 포함."""

    async def list_for_students(self, student_ids: list[UUID]) -> list[BoothVisitRecord]:
        later = NOW + timedelta(minutes=5)
        student_id = student_ids[0]
        return [
            BoothVisitRecord(
                id=uuid4(), student_id=student_id, booth_id=DRONE.id, created_at=later
            ),
            BoothVisitRecord(id=uuid4(), student_id=student_id, booth_id=MAP.id, created_at=NOW),
            BoothVisitRecord(id=uuid4(), student_id=student_id, booth_id=uuid4(), created_at=NOW),
        ]


class _Storage:
    async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
        return {k: f"https://signed.example/{k}" for k in keys}


def _client(repo: _Repo, key: str = KEY) -> httpx.AsyncClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: get_settings().model_copy(
        update={"export_api_key": key}
    )
    app.dependency_overrides[get_export_repo] = lambda: repo
    app.dependency_overrides[get_storage_client] = lambda: _Storage()
    app.dependency_overrides[get_booth_repo] = lambda: _Booths()
    app.dependency_overrides[get_booth_visit_repo] = lambda: _Visits()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


_AUTH = {"Authorization": f"Bearer {KEY}"}


async def test_export_requires_matching_key() -> None:
    async with _client(_Repo([])) as client:
        missing = await client.get("/api/export/v1/students")
        wrong = await client.get(
            "/api/export/v1/students", headers={"Authorization": "Bearer nope"}
        )
    assert missing.status_code == 401
    assert wrong.status_code == 401


async def test_export_disabled_when_key_unset() -> None:
    """키가 비어 있으면 빈 Bearer로도 통과하면 안 된다 — 내보내기 자체가 꺼진다."""
    async with _client(_Repo([]), key="") as client:
        res = await client.get("/api/export/v1/students", headers={"Authorization": "Bearer "})
    assert res.status_code == 401


async def test_export_rejects_admin_token() -> None:
    """관리자 토큰으로는 열리지 않는다 — 전용 키만."""
    from datetime import timedelta

    from app.core.security import TokenKind, create_token

    token = create_token(
        kind=TokenKind.ADMIN, subject="admin", ttl=timedelta(hours=1), settings=get_settings()
    )
    async with _client(_Repo([])) as client:
        res = await client.get(
            "/api/export/v1/students", headers={"Authorization": f"Bearer {token}"}
        )
    assert res.status_code == 401


async def test_export_assembles_student_survey_and_images() -> None:
    row = _row()
    async with _client(_Repo([row])) as client:
        res = await client.get("/api/export/v1/students", headers=_AUTH)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["next_cursor"] is None  # 한 페이지(200) 미만이면 끝
    item = body["items"][0]
    assert "password" not in item
    assert item["photo_url"] == "https://signed.example/photos/a.jpg"
    assert item["survey"]["status"] == "completed"
    assert item["survey"]["answers"][0]["no"] == "Q8"
    assert item["persona"]["base_career"] == "드론 전문가"
    assert item["persona"]["competencies"] == ["탐구", "협업", "설계"]
    assert item["persona"]["image_url"] == "https://signed.example/gen/a.png"


async def test_export_nulls_when_no_session_or_persona() -> None:
    async with _client(_Repo([_row(session=False, persona=False)])) as client:
        res = await client.get("/api/export/v1/students", headers=_AUTH)
    item = res.json()["items"][0]
    assert item["survey"] is None
    assert item["persona"] is None


async def test_export_cursor_paginates_by_last_id() -> None:
    rows = [_row(), _row()]
    repo = _Repo(rows)
    async with _client(repo) as client:
        first = await client.get("/api/export/v1/students", params={"limit": 2}, headers=_AUTH)
        cursor = first.json()["next_cursor"]
        await client.get(
            "/api/export/v1/students", params={"limit": 2, "cursor": cursor}, headers=_AUTH
        )

    assert cursor == str(rows[-1].id)  # 꽉 찬 페이지 → 마지막 id가 다음 커서
    assert repo.calls == [(None, 2), (rows[-1].id, 2)]


async def test_export_single_student_matches_list_item() -> None:
    rows = [_row(), _row(persona=False)]
    repo = _Repo(rows)
    target = rows[1].id
    async with _client(repo) as client:
        one = await client.get(f"/api/export/v1/students/{target}", headers=_AUTH)
        listed = await client.get("/api/export/v1/students", headers=_AUTH)

    assert one.status_code == 200, one.text
    assert repo.student_ids[0] == target
    assert one.json() == listed.json()["items"][1] | {
        # 단건 요청에선 target이 첫 번째라 방문 기록을 받는다(_Visits)
        "booths": one.json()["booths"],
        "competency_scores": one.json()["competency_scores"],
    }


async def test_export_single_student_has_visited_booths_and_10_competencies() -> None:
    row = _row()
    async with _client(_Repo([row])) as client:
        body = (await client.get(f"/api/export/v1/students/{row.id}", headers=_AUTH)).json()

    # 방문 순, 지워진 부스 방문은 빠진다
    assert [b["name"] for b in body["booths"]] == ["지도 만들기", "드론 체험관"]
    scores = {c["key"]: c["score"] for c in body["competency_scores"]}
    assert len(scores) == 10
    assert scores["creativity"] == 2  # 두 부스 모두
    assert scores["challenge"] == 1
    assert scores["planning"] == 0  # 0점도 빠짐없이


async def test_export_list_items_have_booths_per_student() -> None:
    rows = [_row(), _row()]
    async with _client(_Repo(rows)) as client:
        items = (await client.get("/api/export/v1/students", headers=_AUTH)).json()["items"]

    assert [b["name"] for b in items[0]["booths"]] == ["지도 만들기", "드론 체험관"]
    assert items[1]["booths"] == []
    assert [c["score"] for c in items[1]["competency_scores"]] == [0] * 10


async def test_export_booths_lists_all_with_competency_keys() -> None:
    async with _client(_Repo([])) as client:
        res = await client.get("/api/export/v1/booths", headers=_AUTH)
        no_key = await client.get("/api/export/v1/booths")

    assert res.status_code == 200, res.text
    assert [(b["name"], b["zone"], b["competencies"]) for b in res.json()] == [
        ("드론 체험관", "F", ["creativity", "challenge"]),
        ("지도 만들기", "L", ["creativity"]),
    ]
    assert no_key.status_code == 401


async def test_export_single_student_unknown_is_404() -> None:
    async with _client(_Repo([_row()])) as client:
        res = await client.get(f"/api/export/v1/students/{uuid4()}", headers=_AUTH)
    assert res.status_code == 404


async def test_export_single_student_requires_key() -> None:
    row = _row()
    async with _client(_Repo([row])) as client:
        res = await client.get(f"/api/export/v1/students/{row.id}")
    assert res.status_code == 401
