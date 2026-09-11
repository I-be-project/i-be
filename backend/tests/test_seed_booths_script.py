"""seed_booths 스크립트 — 가짜 transport로 HTTP 없이 검증한다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

from scripts.seed_booths import BoothRow, check_competencies, read_rows, run


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "booths.csv"
    path.write_text(body, encoding="utf-8")
    return path


def test_read_rows_parses_empty_competencies(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\nF,드론 시뮬레이션,건양대 무유인항공공학과,\n",
    )

    rows = read_rows(path)

    assert rows == [
        BoothRow(
            zone="F",
            name="드론 시뮬레이션",
            description="건양대 무유인항공공학과",
            competencies=[],
        )
    ]


def test_read_rows_splits_competencies_on_semicolon(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\nF,부스,기관,challenge;analysis;thinking\n",
    )

    rows = read_rows(path)

    assert rows[0].competencies == ["challenge", "analysis", "thinking"]


def test_check_competencies_allows_empty() -> None:
    """매핑 자료가 오기 전에는 전부 비어 있다 — 이게 정상이다."""
    rows = [BoothRow(zone="F", name="부스", description="기관", competencies=[])]

    assert check_competencies(rows) == []


def test_check_competencies_requires_three_for_job_zones() -> None:
    rows = [BoothRow(zone="F", name="부스", description="기관", competencies=["challenge"])]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "3개" in problems[0]


def test_check_competencies_requires_one_for_c_zone() -> None:
    rows = [
        BoothRow(
            zone="C",
            name="스피치ON",
            description="핵심을 전달하라",
            competencies=["communication", "empathy"],
        )
    ]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "1개" in problems[0]


def test_check_competencies_rejects_unknown_key() -> None:
    rows = [
        BoothRow(
            zone="F",
            name="부스",
            description="기관",
            competencies=["challenge", "analysis", "없는역량"],
        )
    ]

    problems = check_competencies(rows)

    assert any("없는역량" in p for p in problems)


def _fake_transport(state: dict[str, Any]) -> httpx.MockTransport:
    """관리자 API 대역. 등록 요청을 state["created"]에 모은다."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/admin/login":
            return httpx.Response(200, json={"admin_token": "t"})
        if request.url.path == "/api/admin/booths" and request.method == "GET":
            return httpx.Response(200, json=state["existing"])
        if request.url.path == "/api/admin/booths" and request.method == "POST":
            body = json.loads(request.content)
            state["created"].append(body)
            return httpx.Response(201, json={**body, "id": "new-id", "code": "ABC234"})
        if request.method == "PATCH":
            state["patched"].append(json.loads(request.content))
            return httpx.Response(200, json={"id": "x"})
        raise AssertionError(f"예상하지 못한 요청: {request.method} {request.url}")

    return httpx.MockTransport(handler)


def _args(csv_path: Path, *, dry_run: bool = False) -> argparse.Namespace:
    return argparse.Namespace(
        base_url="http://test",
        username="admin",
        password="pw",
        csv=str(csv_path),
        dry_run=dry_run,
    )


def test_run_creates_missing_booths(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert len(state["created"]) == 1
    assert state["created"][0]["name"] == "드론 시뮬레이션"
    assert state["created"][0]["zone"] == "F"


def test_run_skips_existing_booth_by_name(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {
        "existing": [{"id": "old", "name": "드론 시뮬레이션", "competencies": []}],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []


def test_run_updates_competencies_of_existing_booth(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\n"
        "F,드론 시뮬레이션,건양대,challenge;analysis;thinking\n",
    )
    state: dict[str, Any] = {
        "existing": [{"id": "old", "name": "드론 시뮬레이션", "competencies": []}],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["patched"] == [{"competencies": ["challenge", "analysis", "thinking"]}]


def test_dry_run_changes_nothing(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path, dry_run=True), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []


def test_bad_competency_count_stops_before_any_request(tmp_path: Path) -> None:
    path = _write(
        tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,challenge\n"
    )
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 1
    assert state["created"] == []
