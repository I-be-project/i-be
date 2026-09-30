"""Admin API lifecycle: no DB access, no AI calls, no global account purge."""

import json
from unittest.mock import MagicMock

import httpx
import pytest

from scripts import run_api_profile_load as runner


@pytest.mark.parametrize("fail_token", [False, True])
def test_owned_accounts_are_cleaned_after_partial_setup(tmp_path, fail_token):
    calls = []
    owned = []
    counter = []
    manifest = tmp_path / "owned.json"

    def handler(req):
        calls.append((req.method, req.url.path))
        if req.url.path == "/api/admin/students/test":
            counter.append(1)
            return httpx.Response(201, json={"id": f"student-{len(counter)}"})
        if req.url.path.endswith("/token"):
            return httpx.Response(500 if fail_token else 200, json={"student_token": "synthetic"})
        if req.url.path == "/api/sessions/complete":
            assert json.loads(req.content)["name"]
            return httpx.Response(
                200,
                json={
                    "has_completed": True,
                    "persona": {"name": "test"},
                    "student": {"name": "test"},
                    "booths": [],
                },
            )
        assert req.method == "DELETE" and req.url.path.startswith("/api/admin/students/student-")
        return httpx.Response(200, json={})

    with httpx.Client(base_url="http://local", transport=httpx.MockTransport(handler)) as client:
        try:
            if fail_token:
                with pytest.raises(ValueError, match="HTTP 500"):
                    runner.prepare_accounts(client, "admin", 2, None, manifest, owned)
            else:
                rows = runner.prepare_accounts(client, "admin", 2, None, manifest, owned)
                assert len({row["student_id"] for row in rows}) == 2
        finally:
            runner.cleanup(client, "admin", owned, manifest)
    assert len(owned) == 2
    assert json.loads(manifest.read_text()) == []
    assert ("DELETE", "/api/admin/students/test") not in calls
    assert all("generate" not in path and "/dev/" not in path for _, path in calls)


def test_only_admin_credentials_loaded(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text(
        "ADMIN_USERNAME=test-admin\nADMIN_PASSWORD=test-password\nDATABASE_URL=not-used\nJWT_SECRET=not-used\n"
    )
    monkeypatch.delenv("ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    assert runner.admin_credentials(str(path)) == {
        "username": "test-admin",
        "password": "test-password",
    }


@pytest.mark.parametrize("status", [200, 404, 500])
def test_cleanup_booth_preserves_manifest_on_failure(tmp_path, status):
    manifest = tmp_path / "booth-owned.json"
    manifest.write_text('["owned-booth"]')

    def handler(req):
        assert req.method == "DELETE"
        assert req.url.path == "/api/admin/booths/owned-booth"
        return httpx.Response(status, json={})

    with httpx.Client(base_url="http://local", transport=httpx.MockTransport(handler)) as client:
        if status == 500:
            with pytest.raises(ValueError, match="정리 실패"):
                runner.cleanup_booth(client, "admin", "owned-booth", manifest)
            assert json.loads(manifest.read_text()) == ["owned-booth"]
        else:
            runner.cleanup_booth(client, "admin", "owned-booth", manifest)
            assert json.loads(manifest.read_text()) == []


def test_k6_scope_and_secrets(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_PASSWORD", "must-not-reach-k6")
    monkeypatch.setenv("DATABASE_URL", "must-not-reach-k6")
    child = MagicMock()
    child.wait.return_value = 0
    child.poll.return_value = 0
    popen = MagicMock(return_value=child)
    monkeypatch.setattr(runner.subprocess, "Popen", popen)
    assert (
        runner.execute_k6(
            "k6",
            "smoke",
            "visit",
            "http://local",
            tmp_path / "accounts.json",
            tmp_path / "summary.json",
            False,
            False,
        )
        == 0
    )
    env = popen.call_args.kwargs["env"]
    assert "ADMIN_PASSWORD" not in env and "DATABASE_URL" not in env
    assert env["REUSE_ACCOUNT"] == "0"
    assert (
        env["REQUIRE_CARD"] == env["REQUIRE_COMPETENCIES"] == env["REQUIRE_VISIT_TIMESTAMP"] == "0"
    )
