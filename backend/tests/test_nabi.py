"""나비 결과 조회 — 어댑터(캐시·장애 폴백)와 /api/students/*/nabi 라우터."""

from __future__ import annotations

from uuid import UUID, uuid4

import httpx

from app.adapters.nabi_client import NabiClient
from app.deps import current_student, get_nabi_client, get_session_service
from app.main import create_app
from tests.test_session_service import _build, _student

_DONE = {
    "student_id": "x",
    "status": "done",
    "image_url": "https://nabi.example/api/img/x/3?sig=s",
    "generated_at": "2026-10-15T05:40:00.000Z",
    "stage": 3,
}


def _nabi(handler, token: str = "tok", **kwargs) -> tuple[NabiClient, list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def record(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        return handler(req)

    client = NabiClient(
        "https://nabi.example/api/results/",
        token,
        transport=httpx.MockTransport(record),
        **kwargs,
    )
    return client, calls


async def test_done_result_is_passed_through_and_cached() -> None:
    client, calls = _nabi(lambda req: httpx.Response(200, json=_DONE))
    sid = uuid4()
    first = await client.get_result(sid)
    assert (first.status, first.image_url, first.stage) == ("done", _DONE["image_url"], 3)
    assert await client.get_result(sid) == first
    assert len(calls) == 1  # 두 번째는 캐시
    assert str(calls[0].url) == f"https://nabi.example/api/results/{sid}"
    assert calls[0].headers["Authorization"] == "Bearer tok"


async def test_done_result_is_cached_longer_than_pending() -> None:
    body: dict[str, object] = {**_DONE, "status": "pending", "image_url": None}
    client, calls = _nabi(
        lambda req: httpx.Response(200, json=body), cache_ttl=0.0, done_cache_ttl=60.0
    )
    sid = uuid4()
    await client.get_result(sid)
    await client.get_result(sid)
    assert len(calls) == 2  # pending은 짧은 TTL(여기선 0) — 매번 다시 묻는다
    body.update(_DONE)
    assert (await client.get_result(sid)).status == "done"
    await client.get_result(sid)
    assert len(calls) == 3  # done은 긴 TTL — 캐시


async def test_failures_and_missing_token_fall_back_to_unavailable() -> None:
    client, _ = _nabi(lambda req: httpx.Response(503))
    assert (await client.get_result(uuid4())).status == "unavailable"

    def timeout(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=req)

    client, _ = _nabi(timeout)
    assert (await client.get_result(uuid4())).status == "unavailable"

    client, calls = _nabi(lambda req: httpx.Response(200, json=_DONE), token="")
    assert (await client.get_result(uuid4())).status == "unavailable"
    assert calls == []


async def test_me_and_shared_endpoints_query_the_right_student() -> None:
    student = _student()
    service, _, _ = _build(latest=None, student=student)
    me = uuid4()
    seen: list[UUID] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(UUID(req.url.path.rsplit("/", 1)[1]))
        return httpx.Response(200, json={"status": "processing", "image_url": None})

    nabi, _ = _nabi(handler)
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    app.dependency_overrides[current_student] = lambda: me
    app.dependency_overrides[get_nabi_client] = lambda: nabi
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/api/students/me/nabi")
        assert res.json() == {"status": "processing", "image_url": None, "stage": None}
        res = await client.get("/api/students/shared/AB23CD45/nabi")
        assert res.status_code == 200 and res.headers["Cache-Control"] == "no-store"
        assert (await client.get("/api/students/shared/ZZ23CD45/nabi")).status_code == 404
    assert seen == [me, student.id]
