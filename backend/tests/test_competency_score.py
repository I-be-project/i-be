"""역량 점수 집계 — 방문한 부스의 역량을 1점씩 더한다."""

from __future__ import annotations

from uuid import uuid4

from app.core.competencies import COMPETENCY_KEYS
from app.services.session_service import compute_competency_scores


def test_no_visits_gives_all_zero() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())

    assert len(scores) == len(COMPETENCY_KEYS)
    assert [s.score for s in scores] == [0] * len(COMPETENCY_KEYS)


def test_axis_order_follows_competency_keys() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())

    assert [s.key for s in scores] == list(COMPETENCY_KEYS)


def test_visited_booth_raises_its_competencies() -> None:
    booth = uuid4()
    scores = compute_competency_scores(
        booth_competencies={booth: ("challenge", "analysis", "thinking")},
        visited_booth_ids={booth},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 1
    assert by_key["analysis"] == 1
    assert by_key["thinking"] == 1
    assert by_key["empathy"] == 0


def test_overlapping_competency_accumulates() -> None:
    first, second = uuid4(), uuid4()
    scores = compute_competency_scores(
        booth_competencies={first: ("challenge", "empathy"), second: ("challenge",)},
        visited_booth_ids={first, second},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 2
    assert by_key["empathy"] == 1


def test_unvisited_booth_does_not_count() -> None:
    visited, skipped = uuid4(), uuid4()
    scores = compute_competency_scores(
        booth_competencies={visited: ("challenge",), skipped: ("empathy",)},
        visited_booth_ids={visited},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 1
    assert by_key["empathy"] == 0


def test_labels_are_korean() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())
    by_key = {s.key: s.label for s in scores}

    assert by_key["communication"] == "의사소통"
    assert by_key["self_understanding"] == "자기이해"
