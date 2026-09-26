"""페르소나·카드 초안 — 문구 분리, 카드 합성, 이미지 실패 처리, 검수 라우터."""

from __future__ import annotations

from io import BytesIO
from typing import Any
from uuid import UUID, uuid4

import httpx
from PIL import Image

from app.core.errors import ExternalServiceError
from app.deps import get_draft_repo, get_storage_client
from app.main import create_app
from app.repositories.draft_repo import DraftTarget
from app.services.draft_batch import DraftBatch
from app.services.draft_service import DraftService, split_headline, to_draft_text
from app.services.id_card_renderer import CARD_H, CARD_W, IdCardContent, render_id_card


def _png(size: tuple[int, int] = (1024, 1536)) -> bytes:
    out = BytesIO()
    Image.new("RGB", size, (200, 200, 200)).save(out, format="PNG")
    return out.getvalue()


# ──────────────────────────────────────────────────────────────
# 문구
# ──────────────────────────────────────────────────────────────


def test_split_headline_strips_career_suffix() -> None:
    assert split_headline("아이디어를 비행으로 구현하는 드론 전문가", "드론 전문가") == (
        "아이디어를 비행으로 구현하는"
    )


def test_split_headline_keeps_name_when_career_not_suffix() -> None:
    """떼어낼 수 없으면 이름 전체를 두고 검수자가 고친다."""
    assert split_headline("드론 전문가가 되는 탐험가", "드론 전문가") == "드론 전문가가 되는 탐험가"


def test_to_draft_text_maps_codex_output() -> None:
    text = to_draft_text(
        {
            "persona_name": "처음 쓰는 사람의 불편을 발견하는 UX 디자이너",
            "base_career": "UX 디자이너",
            "short_description": "설명",
            "source_career_pool": True,
            "pool_extended": False,
        }
    )
    assert text.headline == "처음 쓰는 사람의 불편을 발견하는"
    assert text.tagline == "설명"
    assert text.source_career_pool is True


# ──────────────────────────────────────────────────────────────
# 카드 합성
# ──────────────────────────────────────────────────────────────


def test_render_id_card_outputs_portrait_card_png() -> None:
    png = render_id_card(
        _png(),
        IdCardContent(
            student_name="김나비",
            school="대전관저중학교",
            grade=2,
            class_no=2,
            student_no=12,
            headline="아이디어를 비행으로 구현하는 아주 아주 긴 수식어가 들어가도 잘려선 안 된다",
            base_career="드론 전문가",
            qr_data="https://example.com/p/1",
        ),
    )
    img = Image.open(BytesIO(png))
    assert img.format == "PNG"
    assert img.size == (CARD_W, CARD_H)


def test_render_id_card_without_image_uses_fallback() -> None:
    """생성 이미지가 없어도(사진 없음·codex 거절) 카드는 폴백 캐릭터로 나와야 한다."""
    png = render_id_card(
        None,
        IdCardContent(
            student_name="홍길동",
            school="대전중학교",
            grade=1,
            class_no=1,
            student_no=1,
            headline="",
            base_career="동물훈련사",
            qr_data="https://example.com/p/2",
        ),
    )
    assert Image.open(BytesIO(png)).size == (CARD_W, CARD_H)


# ──────────────────────────────────────────────────────────────
# 이미지 생성 실패 — 일괄 생성이 멈추지 않고 초안에 사유가 남아야 한다
# ──────────────────────────────────────────────────────────────


class _Draft:
    def __init__(self, *, photo_key: str | None = "uploads/p.jpg") -> None:
        self.id = uuid4()
        self.student_id = uuid4()
        self.session_id = uuid4()
        self.photo_key = photo_key


class _Drafts:
    def __init__(self, draft: _Draft) -> None:
        self.draft = draft
        self.saved: dict[str, Any] = {}

    async def get(self, draft_id: UUID) -> Any:
        return self.draft

    async def save_image(self, draft_id: UUID, *, image_key: str | None, error: str | None) -> None:
        self.saved = {"image_key": image_key, "error": error}


class _Storage:
    def __init__(self) -> None:
        self.uploaded: list[str] = []

    async def download(self, key: str) -> bytes:
        return b"photo"

    async def upload_generated_image(self, path: str, data: bytes, *, content_type: str) -> str:
        self.uploaded.append(path)
        return f"ai-images/{path}"


class _Codex:
    def __init__(self, error: Exception | None = None) -> None:
        self._error = error

    async def generate_image(self, prompt: str, *, photo: bytes | None = None) -> bytes:
        if self._error:
            raise self._error
        return _png()


def _service(drafts: _Drafts, codex: _Codex, storage: _Storage) -> DraftService:
    return DraftService(
        codex=codex,  # type: ignore[arg-type]  # 테스트 stub
        storage=storage,  # type: ignore[arg-type]
        sessions=None,  # type: ignore[arg-type]
        drafts=drafts,  # type: ignore[arg-type]
        frontend_origin="http://localhost:4000",
    )


async def test_generate_image_saves_new_key() -> None:
    drafts, storage = _Drafts(_Draft()), _Storage()
    await _service(drafts, _Codex(), storage).generate_image(drafts.draft.id)

    assert drafts.saved["error"] is None
    assert drafts.saved["image_key"].startswith(f"ai-images/{drafts.draft.student_id}/")


async def test_generate_image_failure_records_error_instead_of_raising() -> None:
    drafts = _Drafts(_Draft())
    codex = _Codex(ExternalServiceError("codex 실행이 실패했습니다."))
    await _service(drafts, codex, _Storage()).generate_image(drafts.draft.id)

    assert drafts.saved == {"image_key": None, "error": "codex 실행이 실패했습니다."}


async def test_generate_image_without_photo_records_error() -> None:
    drafts, storage = _Drafts(_Draft(photo_key=None)), _Storage()
    await _service(drafts, _Codex(), storage).generate_image(drafts.draft.id)

    assert drafts.saved["error"] == "원본 사진 없음"
    assert storage.uploaded == []


# ──────────────────────────────────────────────────────────────
# 라우터
# ──────────────────────────────────────────────────────────────


class _MissingDrafts:
    async def get(self, draft_id: UUID) -> None:
        return None


async def test_reject_unknown_draft_is_404() -> None:
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: _MissingDrafts()
    app.dependency_overrides[get_storage_client] = lambda: _Storage()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(f"/api/dev/drafts/{uuid4()}/reject")

    assert res.status_code == 404


# ──────────────────────────────────────────────────────────────
# 일괄 실행기
# ──────────────────────────────────────────────────────────────


class _BatchService:
    """두 번째 학생의 텍스트 생성만 실패하는 DraftService stub."""

    def __init__(self, fail_student: UUID) -> None:
        self._fail = fail_student
        self.images: list[UUID] = []

    async def generate_text(self, session_id: UUID, student_id: UUID) -> UUID:
        if student_id == self._fail:
            raise ExternalServiceError("codex 실행이 실패했습니다.")
        return session_id

    async def generate_image(self, draft_id: UUID) -> None:
        self.images.append(draft_id)


async def test_batch_continues_past_a_failed_student() -> None:
    targets = [DraftTarget(session_id=uuid4(), student_id=uuid4()) for _ in range(3)]
    service = _BatchService(fail_student=targets[1].student_id)

    progress = await DraftBatch().run(service, targets, concurrency=2)  # type: ignore[arg-type]

    assert (progress.total, progress.done, progress.failed) == (3, 3, 1)
    assert not progress.running
    assert sorted(service.images) == sorted([targets[0].session_id, targets[2].session_id])
    assert "codex 실행이 실패했습니다." in progress.errors[0]


class _DeletingDrafts:
    def __init__(self) -> None:
        self.ids: list[UUID] = []

    async def delete_drafts(self, draft_ids: list[UUID]) -> int:
        self.ids = draft_ids
        return len(draft_ids)


async def _post_delete(repo: Any, body: dict[str, Any]) -> httpx.Response:
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/dev/drafts/delete", json=body)


async def test_delete_drafts_dedupes_ids() -> None:
    repo, a, b = _DeletingDrafts(), uuid4(), uuid4()
    res = await _post_delete(repo, {"ids": [str(a), str(b), str(a)]})

    assert res.status_code == 200
    assert res.json() == {"deleted": 2}
    assert repo.ids == [a, b]


async def test_delete_drafts_rejects_empty_ids() -> None:
    res = await _post_delete(_DeletingDrafts(), {"ids": []})

    assert res.status_code == 422
