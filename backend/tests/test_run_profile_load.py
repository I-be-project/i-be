"""Auto-preparation lifecycle tests; never connect to a real DB or API."""

import argparse
import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest

from app.config import Settings
from scripts import run_profile_load as runner


def config():
    return Settings(
        _env_file=None, app_env="local", database_enabled=True, jwt_secret="synthetic-key-" * 4
    )


def test_production_and_credential_urls_rejected():
    settings = config()
    settings.app_env = "production"
    with pytest.raises(ValueError, match="local/staging"):
        runner.validate_target(settings, "http://localhost:8000")
    with pytest.raises(ValueError, match="origin"):
        runner.validate_target(config(), "https://user:password@example.com")


def test_explicit_env_isolated_from_shell(monkeypatch, tmp_path):
    path = tmp_path / ".env.k6"
    path.write_text(
        "APP_ENV=staging\nAPP_BASE_URL=http://localhost:9000\n"
        "DATABASE_URL=postgresql://test-db/test\nJWT_SECRET=file-test-key\n"
        "JWT_CARD_SHARE_SECRET=file-share-key\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://wrong-db/wrong")
    monkeypatch.setenv("JWT_SECRET", "wrong-key")
    settings = runner.load_settings(str(path))
    assert settings.database_url == "postgresql://test-db/test"
    assert settings.jwt_secret == "file-test-key"
    assert settings.app_base_url == "http://localhost:9000"
    path.write_text("APP_ENV=staging\n", encoding="utf-8")
    with pytest.raises(ValueError, match="DATABASE_URL"):
        runner.load_settings(str(path))
    with pytest.raises(ValueError, match="찾을 수"):
        runner.load_settings(str(tmp_path / "missing"))


async def test_cleanup_only_exact_owned_students(monkeypatch):
    conn = MagicMock()
    conn.executemany = AsyncMock()
    conn.close = AsyncMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(runner.asyncpg, "connect", AsyncMock(return_value=conn))
    member = {"id": str(uuid4()), "name": "k6-this-run-0000"}
    await runner.cleanup(config(), [member])
    sql, rows = conn.executemany.call_args.args
    identity, name = rows[0]
    assert "id=$1 and name=$2 and kind='test'" in sql
    assert str(identity) == member["id"]
    assert name == member["name"]
    conn.close.assert_awaited_once()


async def test_seed_links_distinct_profiles_and_varied_visits(monkeypatch):
    conn = MagicMock()
    conn.executemany = AsyncMock()
    conn.close = AsyncMock()
    conn.fetch = AsyncMock(return_value=[{"id": uuid4()} for _ in range(10)])
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(runner.asyncpg, "connect", AsyncMock(return_value=conn))
    members = [{"id": str(uuid4()), "name": f"k6-test-{i}"} for i in range(3)]
    await runner.seed(config(), members)
    batches = [call.args[1] for call in conn.executemany.call_args_list]
    assert [len(batch) for batch in batches] == [3, 3, 3, 3, 13]
    students, sessions, personas, cards, visits = batches
    for i in range(3):
        assert sessions[i][1] == students[i][0]
        assert personas[i][1] == sessions[i][0]
        assert cards[i][0] == personas[i][0]
        assert sum(visit[0] == students[i][0] for visit in visits) == (0, 3, 10)[i]
    conn.close.assert_awaited_once()


async def test_visit_seed_reserves_unvisited_target(monkeypatch):
    target = {"id": uuid4(), "code": "TEST01"}
    conn = MagicMock()
    conn.executemany = AsyncMock()
    conn.close = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=target)
    conn.fetch = AsyncMock(return_value=[target, {"id": uuid4()}])
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(runner.asyncpg, "connect", AsyncMock(return_value=conn))
    members = [{"id": str(uuid4()), "name": f"k6-test-{i}"} for i in range(3)]
    assert await runner.seed(config(), members, with_visit=True) == target
    visit_rows = conn.executemany.call_args_list[-1].args[1]
    assert all(row[1] != target["id"] for row in visit_rows)
    conn.fetchrow.return_value = None
    conn.executemany.reset_mock()
    with pytest.raises(ValueError, match="부스가 최소 1개"):
        await runner.seed(config(), members, with_visit=True)
    conn.executemany.assert_not_called()


async def test_visit_reset_scoped_to_run_members_and_target(monkeypatch):
    conn = MagicMock()
    conn.executemany = AsyncMock()
    conn.close = AsyncMock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(runner.asyncpg, "connect", AsyncMock(return_value=conn))
    member = {"id": str(uuid4()), "name": "k6-owned"}
    booth_id = uuid4()
    await runner.reset_visits(config(), [member], booth_id)
    sql, rows = conn.executemany.call_args.args
    assert "s.id=$1 and s.name=$2 and s.kind='test'" in sql
    assert "v.booth_id=$3" in sql
    assert rows == [(runner.UUID(member["id"]), member["name"], booth_id)]


async def test_preflight_rejects_other_database_profile():
    def response(request):
        return httpx.Response(
            200,
            json={
                "student": {"name": "another-student"},
                "has_completed": True,
                "persona": {"name": "test"},
                "card": {"card_image_url": "signed"},
                "booths": [],
                "competencies": [{}] * 10,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        with pytest.raises(ValueError, match="같은 DB"):
            await runner.preflight(
                client, "http://local", {"student_token": "synthetic"}, "expected"
            )


@pytest.mark.parametrize("failure", ["k6", "preflight", "seed", None])
@pytest.mark.parametrize("journey", ["own", "all"])
async def test_failures_cleanup_and_remove_tokens(monkeypatch, tmp_path, failure, journey):
    monkeypatch.setattr(runner, "LOAD_DIR", tmp_path)
    monkeypatch.setattr(runner.shutil, "which", lambda _: "k6")
    monkeypatch.delenv("BASE_URL", raising=False)
    client = MagicMock()
    client.get = AsyncMock(return_value=httpx.Response(200))
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(runner.httpx, "AsyncClient", lambda **_: client)
    booth = {"id": uuid4(), "code": "TEST01"} if journey == "all" else None
    seed = AsyncMock(
        return_value=booth, side_effect=RuntimeError("seed") if failure == "seed" else None
    )
    preflight = AsyncMock(side_effect=ValueError("preflight") if failure == "preflight" else None)
    cleanup = AsyncMock()
    k6 = MagicMock(return_value=0 if failure is None else 99)
    monkeypatch.setattr(runner, "seed", seed)
    monkeypatch.setattr(runner, "preflight", preflight)
    monkeypatch.setattr(runner, "cleanup", cleanup)
    monkeypatch.setattr(runner, "run_k6", k6)
    reset = AsyncMock()
    monkeypatch.setattr(runner, "reset_visits", reset)
    args = argparse.Namespace(
        profile="all", journey=journey, base_url="http://localhost:8000", cleanup_run=None
    )
    if failure is None:
        assert await runner.run(args, config()) == 0
        journeys = ("own", "shared", "visit") if journey == "all" else ("own",)
        assert [(call.args[1], call.args[5]) for call in k6.call_args_list] == [
            (profile, mode) for profile in runner.PROFILES for mode in journeys
        ]
        assert reset.await_count == (7 if journey == "all" else 0)
    elif failure == "k6":
        assert await runner.run(args, config()) == 99
        assert k6.call_count == 1  # Stop the suite at the first failed profile.
    else:
        with pytest.raises((RuntimeError, ValueError)):
            await runner.run(args, config())
        k6.assert_not_called()
    cleanup.assert_awaited_once()
    members = cleanup.call_args.args[1]
    count = 550 if journey == "all" else 500
    assert len(members) == count
    assert len({row["id"] for row in members}) == count
    assert not list(tmp_path.rglob("accounts.local.json"))
    manifest = next(tmp_path.rglob("manifest.json"))
    assert json.loads(manifest.read_text()) == members
