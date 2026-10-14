"""현장 사전 사진 생성·조회·선택 — 외부 AI와 DB 없이 검증한다."""

from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.adapters.vertex_image_client import GeneratedImage, ImageQuotaError, ImageRefusedError
from app.core.errors import ConflictError, DomainError, ExternalServiceError
from app.deps import current_student, get_onsite_photo_service
from app.main import create_app
from app.repositories.onsite_photo_repo import OnsitePhoto
from app.schemas.students import OnsitePhotoResult
from app.services.api_draft_service import ApiDraftService
from app.services.onsite_photo_service import OnsitePhotoService

STUDENT_ID = uuid4()
PHOTO = OnsitePhoto(uuid4(), STUDENT_ID, "original.jpg", "processing", None, None)


def _service() -> tuple[OnsitePhotoService, Any, Any, Any, Any, Any]:
    photos = AsyncMock()
    photos.get_current.return_value = PHOTO
    photos.claim.return_value = PHOTO
    students = AsyncMock()
    students.get_by_id.return_value = SimpleNamespace(photo_key=PHOTO.photo_key)
    sessions = AsyncMock()
    sessions.get_latest_completed_for_student.return_value = SimpleNamespace(id=uuid4())
    drafts = AsyncMock()
    drafts.get_by_session.return_value = None
    storage = AsyncMock()
    storage.download.return_value = b"source"
    storage.upload_generated_image.return_value = "future.png"
    storage.create_signed_url.return_value = "https://storage.test/future.png"
    service = OnsitePhotoService(
        photos=photos,
        students=students,
        sessions=sessions,
        drafts=drafts,
        draft_service=AsyncMock(),
        storage=storage,
        vertex=AsyncMock(),
    )
    return service, photos, students, sessions, drafts, storage


async def test_starts_before_any_survey_session_exists() -> None:
    service, photos, _, sessions, _, _ = _service()
    assert await service.start(STUDENT_ID) == PHOTO
    photos.claim.assert_awaited_once_with(STUDENT_ID, PHOTO.photo_key)
    sessions.get_latest_completed_for_student.assert_not_awaited()


async def test_missing_original_photo_is_rejected() -> None:
    service, photos, students, _, _, _ = _service()
    students.get_by_id.return_value = SimpleNamespace(photo_key=None)
    with pytest.raises(DomainError):
        await service.start(STUDENT_ID)
    photos.claim.assert_not_awaited()


async def test_generation_publishes_image_without_persona_or_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, photos, _, sessions, drafts, storage = _service()
    generate = AsyncMock(return_value=GeneratedImage(b"image", None))
    monkeypatch.setattr("app.services.onsite_photo_service.vertex_future_photo", generate)
    await service.generate(PHOTO)
    photos.finish.assert_awaited_once_with(PHOTO, "ready", "future.png")
    storage.download.assert_awaited_once_with(PHOTO.photo_key)
    sessions.get_latest_completed_for_student.assert_not_awaited()
    drafts.get_by_session.assert_not_awaited()


@pytest.mark.parametrize(
    "error,status", [(ImageRefusedError("refused"), "refused"), (RuntimeError("offline"), "failed")]
)
async def test_failure_does_not_publish_a_fake_ai_image(
    monkeypatch: pytest.MonkeyPatch, error: Exception, status: str
) -> None:
    service, photos, *_ = _service()
    monkeypatch.setattr(
        "app.services.onsite_photo_service.vertex_future_photo", AsyncMock(side_effect=error)
    )
    await service.generate(PHOTO)
    photos.finish.assert_awaited_once_with(PHOTO, status, None)


async def test_ready_image_is_returned_before_card_exists() -> None:
    service, photos, _, _, drafts, _ = _service()
    photos.get_current.return_value = replace(PHOTO, status="ready", image_key="future.png")
    result = await service.result(STUDENT_ID)
    assert result.image_url == "https://storage.test/future.png"
    drafts.get_by_session.assert_not_awaited()


async def test_choice_requires_completed_survey() -> None:
    service, photos, _, sessions, _, _ = _service()
    sessions.get_latest_completed_for_student.return_value = None
    with pytest.raises(DomainError):
        await service.choose(STUDENT_ID, "character")
    photos.choose.assert_not_awaited()


async def test_character_can_be_chosen_while_generation_is_processing() -> None:
    service, photos, *_ = _service()
    photos.choose.return_value = True
    photos.get_current.side_effect = [PHOTO, replace(PHOTO, choice="character")]
    result = await service.choose(STUDENT_ID, "character")
    assert result.choice == "character"
    service.draft_service.choose_card_photo.assert_not_awaited()


async def test_conflicting_choice_is_rejected() -> None:
    service, photos, *_ = _service()
    photos.choose.return_value = False
    with pytest.raises(ConflictError):
        await service.choose(STUDENT_ID, "ai")


@pytest.mark.parametrize(
    "status,choice,raises",
    [
        ("processing", None, ImageQuotaError),
        ("failed", None, ExternalServiceError),
        ("ready", "character", ImageRefusedError),
    ],
)
async def test_publisher_does_not_generate_a_second_image(
    status: str, choice: str | None, raises: type[Exception]
) -> None:
    photos, storage, vertex = AsyncMock(), AsyncMock(), AsyncMock()
    photos.get_current.return_value = replace(PHOTO, status=status, choice=choice)
    service = ApiDraftService(
        ai=AsyncMock(),
        vertex=vertex,
        draft_service=AsyncMock(),
        drafts=AsyncMock(),
        storage=storage,
        persona_model="test",
        onsite_photos=photos,
    )
    with pytest.raises(raises):
        await service._image(cast(Any, SimpleNamespace(id=STUDENT_ID, photo_key=PHOTO.photo_key)))
    vertex.generate_image.assert_not_awaited()


async def test_publisher_reuses_ready_image() -> None:
    photos, storage, vertex = AsyncMock(), AsyncMock(), AsyncMock()
    photos.get_current.return_value = replace(PHOTO, status="ready", image_key="future.png")
    storage.download.return_value = b"prepared"
    service = ApiDraftService(
        ai=AsyncMock(),
        vertex=vertex,
        draft_service=AsyncMock(),
        drafts=AsyncMock(),
        storage=storage,
        persona_model="test",
        onsite_photos=photos,
    )
    result = await service._image(
        cast(Any, SimpleNamespace(id=STUDENT_ID, photo_key=PHOTO.photo_key))
    )
    assert result.data == b"prepared"
    storage.download.assert_awaited_once_with("future.png")
    vertex.generate_image.assert_not_awaited()


async def test_router_authenticated_start_schedules_only_claimed_job() -> None:
    service = AsyncMock()
    service.start.side_effect = [PHOTO, None]
    service.result.return_value = OnsitePhotoResult(status="processing")
    app = create_app()
    app.dependency_overrides[get_onsite_photo_service] = lambda: service
    app.dependency_overrides[current_student] = lambda: STUDENT_ID
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for _ in range(2):
            response = await client.post("/api/students/me/onsite-photo")
            assert response.status_code == 202
            assert response.json()["status"] == "processing"
    service.generate.assert_awaited_once_with(PHOTO)


async def test_router_requires_student_authentication() -> None:
    app = create_app()
    app.dependency_overrides[get_onsite_photo_service] = lambda: AsyncMock()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for method in ("GET", "POST", "PUT"):
            response = await client.request(
                method, "/api/students/me/onsite-photo", json={"choice": "ai"}
            )
            assert response.status_code == 401


@pytest.mark.parametrize("choice", ["ai", "character"])
async def test_choice_is_applied_to_already_published_card(choice: str) -> None:
    service, photos, _, _, drafts, _ = _service()
    photos.choose.return_value = True
    photos.get_current.side_effect = [PHOTO, replace(PHOTO, choice=choice)]
    drafts.get_by_session.return_value = SimpleNamespace(status="approved", image_key="ai.png")
    await service.choose(STUDENT_ID, cast(Any, choice))
    service.draft_service.choose_card_photo.assert_awaited_once_with(
        STUDENT_ID, use_ai=choice == "ai"
    )


async def test_publisher_waits_for_onsite_image_before_generating_persona() -> None:
    photos = AsyncMock()
    photos.get_current.return_value = PHOTO
    service = ApiDraftService(
        ai=AsyncMock(),
        vertex=AsyncMock(),
        draft_service=AsyncMock(),
        drafts=AsyncMock(),
        storage=AsyncMock(),
        persona_model="test",
        onsite_photos=photos,
    )
    student = cast(Any, SimpleNamespace(id=STUDENT_ID, photo_key=PHOTO.photo_key))
    assert await service.waiting_for_onsite_photo(student)
    photos.get_current.return_value = replace(PHOTO, status="ready", image_key="future.png")
    assert not await service.waiting_for_onsite_photo(student)
    photos.get_current.return_value = replace(PHOTO, status="failed")
    assert not await service.waiting_for_onsite_photo(student)
    photos.get_current.return_value = replace(PHOTO, choice="character")
    assert not await service.waiting_for_onsite_photo(student)


async def test_existing_card_photo_is_available_without_new_table_or_card_image() -> None:
    from tests.test_session_service import _persona, _session
    from tests.test_students_profile_router import _service as existing_service

    persona = replace(_persona(), image_key="future.png", ai_image_key="future.png")
    service = existing_service(latest=_session("completed"), persona=persona)
    result = await service.get_card_photo_result(STUDENT_ID)
    assert result.status == "ready"
    assert result.image_url == "https://signed.example/future.png?ttl=3600"
    assert result.choice is None


async def test_existing_card_returns_selected_photo_without_career_text() -> None:
    from datetime import UTC, datetime

    from tests.test_session_service import _persona, _session
    from tests.test_students_profile_router import _service as existing_service

    persona = replace(
        _persona(),
        image_key="selected.png",
        ai_image_key="future.png",
        photo_chosen_at=datetime.now(UTC),
    )
    service = existing_service(latest=_session("completed"), persona=persona)
    result = await service.get_card_photo_result(STUDENT_ID)
    assert result.image_url == "https://signed.example/selected.png?ttl=3600"
    assert result.choice == "ai"
    assert "name" not in result.model_dump()


async def test_existing_fallback_is_not_confirmed_until_user_selects_it() -> None:
    from tests.test_session_service import _persona, _session
    from tests.test_students_profile_router import _service as existing_service

    service = existing_service(latest=_session("completed"), persona=_persona())
    result = await service.get_card_photo_result(STUDENT_ID)
    assert result.status == "refused"
    assert result.choice is None


async def test_legacy_card_allows_explicit_character_choice_when_ai_is_unavailable() -> None:
    from app.services.draft_service import DraftService

    drafts, sessions = AsyncMock(), AsyncMock()
    sessions.get_latest_completed_for_student.return_value = SimpleNamespace(id=uuid4())
    draft = SimpleNamespace(status="approved", image_key=None, session_id=uuid4())
    drafts.get_by_session.return_value = draft
    drafts.persona_photo_chosen.return_value = False
    drafts.choose_persona_photo.return_value = True
    service = DraftService(
        codex=AsyncMock(),
        storage=AsyncMock(),
        sessions=sessions,
        drafts=drafts,
        students=AsyncMock(),
        qr_origin="http://test",
    )
    service.upload_card = AsyncMock()
    await service.choose_card_photo(STUDENT_ID, use_ai=False)
    drafts.choose_persona_photo.assert_awaited_once_with(draft.session_id, None)
    with pytest.raises(DomainError):
        await service.choose_card_photo(STUDENT_ID, use_ai=True)
