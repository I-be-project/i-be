"""카드 사진 선택 — 공개된 카드를 AI 사진 / 캐릭터로 바꿔 다시 합성한다."""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from PIL import Image

from app.core.errors import DomainError, NotFoundError
from app.repositories.persona_repo import PersonaRecord
from app.services.draft_service import DraftService


def _png() -> bytes:
    out = BytesIO()
    Image.new("RGB", (400, 500), (120, 140, 160)).save(out, format="PNG")
    return out.getvalue()


def _draft(*, status: str = "approved", image_key: str | None = "ai-images/a.png") -> Any:
    return SimpleNamespace(
        id=uuid4(), session_id=uuid4(), student_id=uuid4(), status=status, image_key=image_key,
        student_name="최수아", school="", grade=0, class_no=0, student_no=0,
        headline="색으로 마음을 담는", base_career="인테리어 디자이너",
    )  # fmt: skip


class _Drafts:
    def __init__(self, draft: Any) -> None:
        self.draft = draft
        self.persona_image: Any = "unset"

    async def get_by_session(self, session_id: UUID) -> Any:
        return self.draft

    async def set_persona_image(self, session_id: UUID, image_key: str | None) -> None:
        self.persona_image = image_key


class _Storage:
    def __init__(self) -> None:
        self.downloads: list[str] = []
        self.cards: list[str] = []

    async def download(self, key: str) -> bytes:
        self.downloads.append(key)
        return _png()

    async def upload_card_image(self, path: str, data: bytes, *, content_type: str) -> str:
        self.cards.append(path)
        return f"cards/{path}"


class _Sessions:
    async def get_latest_completed_for_student(self, student_id: UUID) -> Any:
        return SimpleNamespace(id=uuid4())


class _Students:
    async def ensure_card_code(self, student_id: UUID) -> str:
        return "ABCD1234"


def _service(draft: Any) -> tuple[DraftService, _Drafts, _Storage]:
    drafts, storage = _Drafts(draft), _Storage()
    service = DraftService(
        codex=cast(Any, None),
        storage=cast(Any, storage),
        sessions=cast(Any, _Sessions()),
        drafts=cast(Any, drafts),
        students=cast(Any, _Students()),
        qr_origin="https://example.com",
    )
    return service, drafts, storage


async def test_choose_character_rerenders_without_ai_photo() -> None:
    draft = _draft()
    service, drafts, storage = _service(draft)
    await service.choose_card_photo(draft.student_id, use_ai=False)
    assert storage.downloads == []  # AI 사진을 쓰지 않고 폴백 캐릭터로 합성
    assert storage.cards == [f"{draft.student_id}/{draft.id}.png"]  # 같은 키에 덮어쓴다
    assert drafts.persona_image is None


async def test_choose_ai_rerenders_with_ai_photo() -> None:
    draft = _draft()
    service, drafts, storage = _service(draft)
    await service.choose_card_photo(draft.student_id, use_ai=True)
    assert storage.downloads == ["ai-images/a.png"]
    assert drafts.persona_image == "ai-images/a.png"


async def test_choose_without_ai_photo_is_rejected() -> None:
    service, _, _ = _service(_draft(image_key=None))
    with pytest.raises(DomainError):
        await service.choose_card_photo(uuid4(), use_ai=True)


async def test_choose_before_card_is_published_is_not_found() -> None:
    service, _, _ = _service(_draft(status="pending"))
    with pytest.raises(NotFoundError):
        await service.choose_card_photo(uuid4(), use_ai=False)


@pytest.mark.parametrize(
    ("image_key", "ai_image_key", "expected"),
    [
        ("ai-images/a.png", "ai-images/a.png", "ai"),
        (None, "ai-images/a.png", "character"),
        (None, None, None),
    ],
)
async def test_profile_card_reports_photo_choice(
    image_key: str | None, ai_image_key: str | None, expected: str | None
) -> None:
    from app.services.session_service import SessionService

    persona = PersonaRecord(
        id=uuid4(), session_id=uuid4(), name="n", tagline="t", keywords=[], fields=[],
        created_at=cast(Any, None), image_key=image_key, ai_image_key=ai_image_key,
    )  # fmt: skip
    service = SessionService.__new__(SessionService)
    service._cards = cast(Any, SimpleNamespace(get_by_persona=_card))
    service._storage = cast(Any, SimpleNamespace(create_signed_url=_signed))
    service._settings = cast(Any, SimpleNamespace(share_link_ttl_hours=1))
    card = await service._build_card_summary(persona)
    assert card is not None and card.photo_choice == expected


async def _card(persona_id: UUID) -> Any:
    return SimpleNamespace(card_image_key="cards/x.png")


async def _signed(key: str, *, ttl_seconds: int) -> str:
    return f"https://s3/{key}"
