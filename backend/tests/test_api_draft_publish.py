"""카드 자동 공개 — 폴링 대상 생성 → 공개. 일시적 실패는 공개하지 않는다.

2026-10-11 첫 가동에서 429·사고 요약만 온 응답을 폴백 카드로 공개해 버렸다 — 그 회귀를 막는다.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from google.genai import errors, types
from PIL import Image

from app.adapters.vertex_image_client import (
    GeneratedImage,
    ImageRefusedError,
    VertexAccount,
    VertexImageClient,
)
from app.core.errors import ExternalServiceError
from app.core.prompts.future_photo_prompt import DEFAULT_FUTURE_PHOTO_PROMPT
from app.repositories.draft_repo import DraftTarget
from app.services.api_draft_service import ApiDraftService
from app.services.card_publisher import CardPublisher

PERSONA = {
    "career_name": "체험 프로그램 기획자",
    "persona_name": "도구를 쉽게 익히게 하는 체험 프로그램 기획자",
    "short_description": "설명",
    "career_required_competencies": ["의사소통", "협업", "계획성"],
}


def _png() -> bytes:
    buf = BytesIO()
    Image.effect_noise((40, 50), 64).convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


class _AI:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def chat(self, purpose: Any, messages: Any, **kwargs: Any) -> Any:
        if self.error:
            raise self.error
        msg = SimpleNamespace(content=json.dumps(PERSONA, ensure_ascii=False))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=msg)], usage=SimpleNamespace(cost=0.004)
        )


class _Vertex:
    """errors를 차례로 던지고, 다 쓰면 이미지를 돌려준다."""

    def __init__(self, *errors_: Exception) -> None:
        self.errors = list(errors_)
        self.calls = 0

    async def generate_image(self, prompt: str, images: Any, **kwargs: Any) -> GeneratedImage:
        self.calls += 1
        self.prompt = prompt
        if self.errors:
            raise self.errors.pop(0)
        return GeneratedImage(_png(), 0.04)


class _DraftService:
    def __init__(self) -> None:
        self.approved: list[UUID] = []

    async def persona_prompts(self, session_id: UUID) -> tuple[str, str]:
        return "system", "user"

    async def approve(self, draft_id: UUID) -> str:
        self.approved.append(draft_id)
        return "cards/x.png"


class _Drafts:
    def __init__(self, targets: list[DraftTarget] | None = None) -> None:
        self.draft_id = uuid4()
        self.text: Any = None
        self.image: dict[str, Any] = {}
        self.targets = targets or []
        self.since: Any = None

    async def list_publish_targets(self, *, since: Any, limit: int) -> list[DraftTarget]:
        self.since = since
        return self.targets

    async def save_text(self, session_id: UUID, student_id: UUID, text: Any, raw: Any) -> UUID:
        self.text = text
        return self.draft_id

    async def save_image(self, draft_id: UUID, *, image_key: str | None, error: str | None) -> None:
        self.image = {"image_key": image_key, "error": error}


class _Storage:
    async def download(self, key: str) -> bytes:
        return _png()

    async def upload_generated_image(self, path: str, data: bytes, *, content_type: str) -> str:
        return f"ai-images/{path}"


class _Students:
    def __init__(self, photo_key: str | None = "uploads/p.jpg") -> None:
        self.photo_key = photo_key

    async def get_by_id(self, student_id: UUID) -> Any:
        return SimpleNamespace(id=student_id, photo_key=self.photo_key, deleted_at=None)


SINCE = datetime(2026, 10, 11, tzinfo=UTC)


def _publisher(
    *,
    ai: _AI | None = None,
    vertex: _Vertex | None = None,
    students: _Students | None = None,
    targets: list[DraftTarget] | None = None,
    concurrency: int = 2,
) -> tuple[CardPublisher, _Drafts, _DraftService]:
    drafts, draft_service = _Drafts(targets), _DraftService()
    service = ApiDraftService(
        ai=cast(Any, ai or _AI()),
        vertex=cast(Any, vertex or _Vertex()),
        draft_service=cast(Any, draft_service),
        drafts=cast(Any, drafts),
        storage=cast(Any, _Storage()),
        persona_model="openai/gpt-6-luna",
    )
    publisher = CardPublisher(
        service=service,
        drafts=cast(Any, drafts),
        students=cast(Any, students or _Students()),
        since=SINCE,
        concurrency=concurrency,
        max_attempts=3,
    )
    return publisher, drafts, draft_service


def _target() -> DraftTarget:
    return DraftTarget(session_id=uuid4(), student_id=uuid4())


QUOTA = ExternalServiceError("Vertex AI 이미지 API 오류(429)")


async def test_publish_saves_and_approves_immediately() -> None:
    publisher, drafts, draft_service = _publisher()
    draft_id = await publisher.publish(_target())
    assert drafts.text.base_career == "체험 프로그램 기획자"
    assert drafts.image["image_key"].startswith("ai-images/")
    assert draft_service.approved == [draft_id]


async def test_api_photo_uses_review_draft_prompt() -> None:
    """API 경로도 codex 검수 초안과 같은 사진 프롬프트를 쓴다."""
    vertex = _Vertex()
    publisher, _, _ = _publisher(vertex=vertex)
    await publisher.publish(_target())
    assert vertex.prompt == DEFAULT_FUTURE_PHOTO_PROMPT


async def test_refused_photo_publishes_fallback() -> None:
    vertex = _Vertex(ImageRefusedError("Vertex AI가 이미지를 만들지 않았습니다: 얼굴 없음"))
    publisher, drafts, draft_service = _publisher(vertex=vertex)
    await publisher.publish(_target())
    assert drafts.image["image_key"] is None
    assert draft_service.approved == [drafts.draft_id]


async def test_transient_failure_saves_nothing_so_next_poll_retries() -> None:
    """429는 공개도 저장도 하지 않는다 — 초안이 없으니 다음 폴링에 다시 대상이 된다."""
    publisher, drafts, draft_service = _publisher(vertex=_Vertex(QUOTA))
    assert await publisher.publish(_target()) is None
    assert drafts.text is None
    assert draft_service.approved == []


async def test_transient_failure_past_limit_is_held_not_published() -> None:
    publisher, drafts, draft_service = _publisher(vertex=_Vertex(QUOTA, QUOTA, QUOTA))
    target = _target()
    for _ in range(3):
        await publisher.publish(target)
    assert drafts.image == {"image_key": None, "error": str(QUOTA)}
    assert draft_service.approved == []


async def test_persona_failure_never_saves() -> None:
    publisher, drafts, draft_service = _publisher(ai=_AI(RuntimeError("timeout")))
    target = _target()
    for _ in range(3):
        assert await publisher.publish(target) is None
    assert drafts.text is None
    assert draft_service.approved == []


async def test_skips_student_without_photo() -> None:
    vertex = _Vertex()
    publisher, _, _ = _publisher(vertex=vertex, students=_Students(photo_key=None))
    assert await publisher.publish(_target()) is None
    assert vertex.calls == 0


async def test_run_once_uses_since_and_skips_exhausted_targets() -> None:
    exhausted, fresh = _target(), _target()
    publisher, drafts, draft_service = _publisher(targets=[exhausted, fresh], concurrency=2)
    publisher._attempts[exhausted.session_id] = 3
    assert await publisher.run_once() == 1
    assert drafts.since == SINCE
    assert len(draft_service.approved) == 1


async def test_run_once_limits_batch_to_concurrency() -> None:
    publisher, _, draft_service = _publisher(
        targets=[_target(), _target(), _target()], concurrency=2
    )
    assert await publisher.run_once() == 2
    assert len(draft_service.approved) == 2


# ──────────────────────────────────────────────────────────────
# Vertex 응답 해석
# ──────────────────────────────────────────────────────────────


class _Models:
    def __init__(self, codes: list[int], parts: list[types.Part] | None = None) -> None:
        self.codes = codes
        self.parts = parts
        self.calls = 0

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls += 1
        if self.codes:
            raise errors.APIError(self.codes.pop(0), {"error": {"message": "x"}})
        parts = self.parts or [types.Part.from_bytes(data=_png(), mime_type="image/png")]
        return SimpleNamespace(parts=parts, usage_metadata=None, candidates=[])


def _vertex(*models: _Models) -> VertexImageClient:
    fakes = [SimpleNamespace(aio=SimpleNamespace(models=m)) for m in models]
    return VertexImageClient(
        accounts=[VertexAccount(f"p{i}") for i in range(len(models))],
        location="global", model="m", image_size="",
        clients=fakes, retry_delays=(0, 0),
    )  # fmt: skip


async def test_vertex_retries_quota_errors_then_succeeds() -> None:
    models = _Models([429, 503])
    await _vertex(models).generate_image("p", [_png()], aspect_ratio="4:5")
    assert models.calls == 3


async def test_vertex_alternates_projects_per_call() -> None:
    """프로젝트 두 개면 호출마다 번갈아 써서 할당량을 나눈다."""
    a, b = _Models([]), _Models([])
    vertex = _vertex(a, b)
    for _ in range(4):
        await vertex.generate_image("p", [_png()], aspect_ratio="4:5")
    assert (a.calls, b.calls) == (2, 2)


async def test_vertex_quota_error_retries_on_the_other_project() -> None:
    a, b = _Models([429]), _Models([])
    await _vertex(a, b).generate_image("p", [_png()], aspect_ratio="4:5")
    assert (a.calls, b.calls) == (1, 1)


async def test_vertex_does_not_retry_bad_request() -> None:
    models = _Models([400])
    with pytest.raises(ExternalServiceError, match=r"\(400\)"):
        await _vertex(models).generate_image("p", [_png()], aspect_ratio="4:5")
    assert models.calls == 1


async def test_vertex_thought_only_response_is_not_a_refusal() -> None:
    thought = types.Part(text="**Refining Identity Photo Parameters**", thought=True)
    with pytest.raises(ExternalServiceError) as exc:
        await _vertex(_Models([], [thought])).generate_image("p", [_png()], aspect_ratio="4:5")
    assert not isinstance(exc.value, ImageRefusedError)


async def test_vertex_text_answer_is_a_refusal() -> None:
    answer = types.Part(text="사진에 실제 사람의 얼굴이 없습니다.")
    with pytest.raises(ImageRefusedError, match="얼굴이 없습니다"):
        await _vertex(_Models([], [answer])).generate_image("p", [_png()], aspect_ratio="4:5")
