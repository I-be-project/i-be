"""API 초안(ApiDraftService)의 부분 실패 처리 — 한쪽 생성이 실패해도 다른 쪽 결과를 살린다."""

from __future__ import annotations

from app.services.api_draft_service import _timed


async def _ok() -> str:
    return "done"


async def _fail() -> str:
    raise RuntimeError("Vertex AI가 이미지를 만들지 않았습니다: 얼굴 없음")


async def test_timed_returns_result() -> None:
    result, error, seconds = await _timed(_ok())
    assert (result, error) == ("done", None)
    assert seconds >= 0


async def test_timed_swallows_failure_as_reason() -> None:
    result, error, _ = await _timed(_fail())
    assert result is None
    assert error is not None and "얼굴 없음" in str(error)
