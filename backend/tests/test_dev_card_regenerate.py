"""카드 재생성용 초안 조회와 학생 선택 정렬. 실제 AI 호출은 하지 않는다."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.errors import NotFoundError
from app.routers.dev import get_student_draft, list_students


@pytest.mark.parametrize("school", [None, "대전관저중학교"])
async def test_student_picker_always_uses_registration_order(school: str | None) -> None:
    students = SimpleNamespace(list_students=AsyncMock(return_value=(0, [])))
    sessions = SimpleNamespace(get_progress_for_students=AsyncMock(return_value={}))
    storage = SimpleNamespace(create_signed_urls=AsyncMock(return_value={}))
    await list_students(
        students, sessions, storage, q=None, school=school, grade=1, class_no=10, limit=50
    )
    assert students.list_students.call_args.kwargs["sort"] == "created_desc"
    assert students.list_students.call_args.kwargs["school"] == school


async def test_latest_completed_session_determines_card_draft() -> None:
    student_id, session_id, draft_id = uuid4(), uuid4(), uuid4()
    sessions = SimpleNamespace(
        get_latest_completed_for_student=AsyncMock(return_value=SimpleNamespace(id=session_id))
    )
    drafts = SimpleNamespace(get_by_session=AsyncMock(return_value=SimpleNamespace(id=draft_id)))
    storage = object()
    with patch("app.routers.dev._get_draft_item", new=AsyncMock(return_value="card")) as get_item:
        result = await get_student_draft(student_id, sessions, drafts, storage)
    sessions.get_latest_completed_for_student.assert_awaited_once_with(student_id)
    drafts.get_by_session.assert_awaited_once_with(session_id)
    get_item.assert_awaited_once_with(draft_id, drafts, storage)
    assert result == "card"


@pytest.mark.parametrize("has_session", [False, True])
async def test_missing_card_draft_returns_not_found(has_session: bool) -> None:
    sessions = SimpleNamespace(
        get_latest_completed_for_student=AsyncMock(
            return_value=SimpleNamespace(id=uuid4()) if has_session else None
        )
    )
    drafts = SimpleNamespace(get_by_session=AsyncMock(return_value=None))
    with pytest.raises(NotFoundError, match="재생성할 카드 초안"):
        await get_student_draft(uuid4(), sessions, drafts, object())
    if not has_session:
        drafts.get_by_session.assert_not_awaited()
