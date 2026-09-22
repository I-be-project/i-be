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


def test_check_competencies_rejects_unknown_zone() -> None:
    """zone 오타는 역량 칸이 비어 있어도 잡아야 한다 — 등록 도중 422로 죽으면

    그때까지 만든 부스가 남는다.
    """
    rows = [BoothRow(zone="X", name="부스", description="기관", competencies=[])]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "X" in problems[0]


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
    """관리자 API 대역. 등록 요청을 state["created"]에 모은다.

    GET 응답의 competencies는 사전순으로 정렬해 돌려준다 — 실제 서버가
    `array_agg(... order by competency)`로 그렇게 돌려주기 때문이다(booth_repo.py).
    여기서 state["existing"]을 그대로(CSV 순서 등으로) 돌려주면 가짜가 진짜보다
    친절해져, 순서만 다르고 내용은 같은 경우를 잡아내는 비교 로직 버그를 못 잡는다.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/admin/login":
            return httpx.Response(200, json={"admin_token": "t"})
        if request.url.path == "/api/admin/booths" and request.method == "GET":
            existing = [
                {**b, "competencies": sorted(b.get("competencies") or [])}
                for b in state["existing"]
            ]
            return httpx.Response(200, json=existing)
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


def test_run_skips_patch_when_competencies_already_match_regardless_of_order(
    tmp_path: Path,
) -> None:
    """서버는 역량을 사전순으로 돌려주고 CSV는 자연 순서다 — 내용이 같으면 순서가 달라도

    PATCH하지 않아야 한다. 순서까지 비교하면 매 실행 갱신 대상으로 오판해
    dry-run이 "바뀔 게 없는데 바뀐다"고 거짓말하게 된다.
    """
    path = _write(
        tmp_path,
        "zone,name,description,competencies\n"
        "F,드론 시뮬레이션,건양대,challenge;analysis;thinking\n",
    )
    state: dict[str, Any] = {
        # 실제 서버라면 이미 사전순(analysis, challenge, thinking)으로 저장돼 있을 상태.
        # _fake_transport가 GET에서 사전순으로 정렬해 돌려주므로 여기 순서는 상관없다.
        "existing": [
            {
                "id": "old",
                "name": "드론 시뮬레이션",
                "competencies": ["challenge", "analysis", "thinking"],
            }
        ],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["patched"] == []


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
