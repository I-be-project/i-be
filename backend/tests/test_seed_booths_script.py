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


def test_check_competencies_allows_empty_only_for_zoneless_booth() -> None:
    """존 없는 부스(기타)만 역량 0개다. 직업체험 부스가 비어 있으면 갱신 시 역량이 지워진다."""
    rows = [
        BoothRow(zone="", name="기타", description="기관", competencies=[]),
        BoothRow(zone="F", name="부스", description="기관", competencies=[]),
    ]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "'부스'" in problems[0]


def test_read_rows_reads_code_and_detail(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "code,program_id,zone,name,description,detail,competencies\n"
        "ganzcw,NB26-017,F,드론,건양대,학생용 설명,challenge;analysis;thinking\n",
    )

    row = read_rows(path)[0]

    assert row.code == "GANZCW"
    assert row.detail == "학생용 설명"


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


HEADER = "code,zone,name,description,detail,competencies\n"
ROW = "F,드론 시뮬레이션,건양대,설명,challenge;analysis;thinking\n"


def _booth(**overrides: Any) -> dict[str, Any]:
    """CSV ROW와 내용이 같은 서버 부스."""
    return {
        "id": "old",
        "code": "GANZCW",
        "name": "드론 시뮬레이션",
        "description": "건양대",
        "detail": "설명",
        "zone": "F",
        "competencies": ["challenge", "analysis", "thinking"],
        **overrides,
    }


def test_run_creates_missing_booths(tmp_path: Path) -> None:
    path = _write(tmp_path, HEADER + "," + ROW)
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert len(state["created"]) == 1
    assert state["created"][0]["name"] == "드론 시뮬레이션"
    assert state["created"][0]["zone"] == "F"
    assert state["created"][0]["detail"] == "설명"


def test_run_skips_existing_booth_by_name(tmp_path: Path) -> None:
    path = _write(tmp_path, HEADER + "," + ROW)
    state: dict[str, Any] = {"existing": [_booth()], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []
    assert state["patched"] == []


def test_run_updates_existing_booth_by_code_even_if_renamed(tmp_path: Path) -> None:
    """노션에서 이름을 바꿔도 code로 찾아 갱신한다 — 이름 매칭이면 새 부스가 하나 더 생긴다."""
    path = _write(tmp_path, HEADER + "GANZCW," + ROW)
    state: dict[str, Any] = {
        "existing": [_booth(name="드론 시뮬레이터(옛 이름)", competencies=[])],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []
    assert state["patched"] == [
        {"name": "드론 시뮬레이션", "competencies": ["challenge", "analysis", "thinking"]}
    ]


def test_run_refuses_unknown_code(tmp_path: Path) -> None:
    """오타난 code로 새 부스를 만들면 인쇄된 QR과 어긋난다."""
    path = _write(tmp_path, HEADER + "ZZZZZZ," + ROW)
    state: dict[str, Any] = {"existing": [_booth()], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 1
    assert state["created"] == []
    assert state["patched"] == []


def test_run_skips_patch_when_competencies_already_match_regardless_of_order(
    tmp_path: Path,
) -> None:
    """서버는 역량을 사전순으로 돌려주고 CSV는 자연 순서다 — 내용이 같으면 순서가 달라도

    PATCH하지 않아야 한다. 순서까지 비교하면 매 실행 갱신 대상으로 오판해
    dry-run이 "바뀔 게 없는데 바뀐다"고 거짓말하게 된다.
    _fake_transport가 GET에서 사전순으로 정렬해 돌려준다.
    """
    path = _write(tmp_path, HEADER + "GANZCW," + ROW)
    state: dict[str, Any] = {"existing": [_booth()], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["patched"] == []


def test_dry_run_changes_nothing(tmp_path: Path) -> None:
    path = _write(
        tmp_path, HEADER + "," + ROW + "GANZCW,F,새 이름,건양대,설명,challenge;analysis;thinking\n"
    )
    state: dict[str, Any] = {"existing": [_booth()], "created": [], "patched": []}

    code = run(_args(path, dry_run=True), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []
    assert state["patched"] == []


def test_bad_competency_count_stops_before_any_request(tmp_path: Path) -> None:
    path = _write(tmp_path, HEADER + ",F,드론 시뮬레이션,건양대,,challenge\n")
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 1
    assert state["created"] == []
