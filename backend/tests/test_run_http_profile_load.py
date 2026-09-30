"""The HTTP runner must never prepare or remove server-side accounts."""

import argparse
import base64
import json
from unittest.mock import MagicMock

import httpx

from scripts import run_http_profile_load as runner


def test_http_runner_only_reads_existing_profile(monkeypatch, tmp_path):
    claims = {"sub": "existing-student", "kind": "student"}
    token = (
        "header."
        + base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
        + ".signature"
    )
    monkeypatch.setenv("K6_STUDENT_TOKEN", token)
    monkeypatch.setenv("DATABASE_URL", "must-not-be-used")
    monkeypatch.setattr(runner, "LOAD_DIR", tmp_path)
    monkeypatch.setattr(runner.shutil, "which", lambda _: "k6")
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        if request.url.path == "/healthz":
            return httpx.Response(200, json={"status": "ok"})
        assert request.headers["Authorization"] == f"Bearer {token}"
        return httpx.Response(
            200,
            json={
                "has_completed": True,
                "student": {"name": "existing"},
                "persona": {"name": "test"},
                "card": {"card_image_url": "signed"},
                "booths": [],
                "competencies": [{}] * 10,
            },
        )

    real_client = httpx.Client
    monkeypatch.setattr(
        runner.httpx,
        "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    child = MagicMock()
    child.wait.return_value = 0
    child.poll.return_value = 0
    popen = MagicMock(return_value=child)
    monkeypatch.setattr(runner.subprocess, "Popen", popen)
    args = argparse.Namespace(
        base_url="http://localhost:9999",
        profile="smoke",
        journey="own",
        booth_code=None,
        check_only=False,
    )
    assert runner.run(args) == 0
    assert seen == [("GET", "/healthz"), ("GET", "/api/students/me")]
    env = popen.call_args.kwargs["env"]
    assert "DATABASE_URL" not in env and "K6_STUDENT_TOKEN" not in env
    assert env["REUSE_ACCOUNT"] == "1"
    assert not list(tmp_path.rglob("accounts.local.json"))


def test_visit_prepare_only_reads_and_captures_baseline():
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        if request.url.path.endswith("/me"):
            return httpx.Response(
                200,
                json={
                    "has_completed": True,
                    "student": {"name": "existing"},
                    "persona": {"name": "test"},
                    "card": {"card_image_url": "signed"},
                    "booths": [
                        {
                            "id": "booth",
                            "name": "Test booth",
                            "visited": False,
                            "competencies": ["c0"],
                        }
                    ],
                    "competencies": [{"key": f"c{i}", "score": 0} for i in range(10)],
                },
            )
        return httpx.Response(
            200, json={"code": "TEST01", "name": "Test booth", "visited": False, "visited_at": None}
        )

    with httpx.Client(base_url="http://local", transport=httpx.MockTransport(handler)) as client:
        result = runner.prepare(client, {"student_token": "synthetic"}, "visit", "TEST01")
    assert result["booth_id"] == "booth" and result["was_visited"] is False
    assert result["booth_competencies"] == ["c0"]
    assert all(method == "GET" for method, _ in seen)
