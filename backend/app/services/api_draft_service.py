"""API 초안 — 페르소나(OpenRouter) + 10년 뒤 사진(Vertex AI)을 API로 만든다.

/dev/api-draft(미리보기, 저장 안 함)와 카드 자동 공개(CardPublisher)가 같은 generate를 쓴다.
프롬프트·입력은 codex 검수 초안(DraftService)과 같다 — persona_prompts와 미래 사진 입력을 공유한다.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from app.adapters.ai_client import AIClient, AIPurpose
from app.adapters.storage_client import StorageClient
from app.adapters.vertex_image_client import (
    GeneratedImage,
    ImageQuotaError,
    ImageRefusedError,
    VertexImageClient,
)
from app.core.errors import ConflictError, ExternalServiceError
from app.core.images import crop_top, to_codex_input
from app.core.logging import get_logger
from app.core.prompts.future_photo_prompt import (
    BACKGROUND_IMAGE,
    DEFAULT_FUTURE_PHOTO_PROMPT,
    LAYOUT_REFERENCE_IMAGE,
    PHOTO_RATIO,
)
from app.core.prompts.persona_prompt import PERSONA_OUTPUT_SCHEMA
from app.repositories.draft_repo import DraftRepository, DraftTarget, DraftText
from app.repositories.onsite_photo_repo import OnsitePhotoRepository
from app.repositories.student_repo import StudentRecord
from app.services.draft_service import DraftService, to_draft_text

logger = get_logger(__name__)


@dataclass(frozen=True)
class ApiDraft:
    """API 생성 결과 1건. 페르소나·이미지는 따로 실패할 수 있다 — 실패한 쪽은 *_error."""

    persona: dict[str, Any] | None
    text: DraftText | None
    persona_error: str | None
    persona_seconds: float
    persona_cost_usd: float | None
    image: GeneratedImage | None
    image_error: str | None
    image_seconds: float
    # 사진 문제로 모델이 거절했다(얼굴 없음 등) — 다시 해도 같으니 폴백 카드로 공개해도 된다.
    image_refused: bool = False
    # 할당량(429)에 밀렸다 — 학생·사진 탓이 아니니 실패 횟수에 세지 않고 다음 폴링에 다시 한다.
    image_quota: bool = False

    @property
    def publishable(self) -> bool:
        """검수 없이 공개해도 되는 결과인가. 일시적 실패(429 등)로 사진이 빠진 결과는 아니다."""
        return self.text is not None and (self.image is not None or self.image_refused)


async def vertex_future_photo(
    vertex: VertexImageClient, photo: bytes, prompt: str, *, model: str | None = None
) -> GeneratedImage:
    """검수 초안과 같은 입력(사진·구도 실루엣·배경)으로 Vertex 생성 → 4:5 크롭."""
    generated = await vertex.generate_image(
        prompt,
        [to_codex_input(photo), LAYOUT_REFERENCE_IMAGE.read_bytes(), BACKGROUND_IMAGE.read_bytes()],
        # 저장본 비율(PHOTO_RATIO)로 바로 요청 — crop_top은 안전장치로만 남는다.
        aspect_ratio="4:5",
        model=model,
    )
    return GeneratedImage(crop_top(generated.data, PHOTO_RATIO), generated.cost_usd)


class ApiDraftService:
    def __init__(
        self,
        *,
        ai: AIClient,
        vertex: VertexImageClient,
        draft_service: DraftService,
        drafts: DraftRepository,
        storage: StorageClient,
        persona_model: str,
        onsite_photos: OnsitePhotoRepository | None = None,
    ) -> None:
        self._ai = ai
        self._vertex = vertex
        self._draft_service = draft_service
        self._drafts = drafts
        self._storage = storage
        self.persona_model = persona_model
        self._onsite_photos = onsite_photos

    async def waiting_for_onsite_photo(self, student: StudentRecord) -> bool:
        if self._onsite_photos is None:
            return False
        photo = await self._onsite_photos.get_current(student.id)
        return bool(
            photo
            and photo.photo_key == student.photo_key
            and photo.choice != "character"
            and photo.status in ("pending", "processing")
        )

    async def generate(self, student: StudentRecord, session_id: UUID) -> ApiDraft:
        """세션 답변·학생 사진 → 페르소나 + 사진. 둘은 서로 의존하지 않아 동시에 돈다."""
        (p_res, p_err, p_sec), (image, i_err, i_sec) = await asyncio.gather(
            _timed(self._persona(session_id)), _timed(self._image(student))
        )
        persona, cost = p_res if p_res else (None, None)
        return ApiDraft(
            persona=persona,
            text=to_draft_text(persona) if persona else None,
            persona_error=_reason(p_err),
            persona_seconds=p_sec,
            persona_cost_usd=cost,
            image=image,
            image_error=_reason(i_err),
            image_seconds=i_sec,
            image_refused=isinstance(i_err, ImageRefusedError),
            image_quota=isinstance(i_err, ImageQuotaError),
        )

    async def save(self, target: DraftTarget, result: ApiDraft, *, approve: bool) -> UUID:
        """생성 결과 → 초안 저장(같은 세션이면 덮어씀). approve면 바로 승인(카드 공개). 초안 id.

        사진이 없으면 사유를 초안 error에 남긴다 — 승인하면 폴백 캐릭터 카드로 공개되고,
        승인하지 않으면 검수 화면의 실패 목록에서 다시 만들 수 있다.
        """
        if result.persona is None or result.text is None:
            raise ExternalServiceError(
                f"페르소나가 없어 저장할 수 없습니다: {result.persona_error}"
            )
        key = None
        if result.image is not None:
            # 생성 이미지도 영구 보관 — 재생성마다 새 키(DraftService.generate_image와 같다).
            key = await self._storage.upload_generated_image(
                f"{target.student_id}/api-{uuid4().hex}.png",
                result.image.data,
                content_type="image/png",
            )
        raw = dict(result.persona)
        if approve:
            # 승인 전 중단되어도 같은 이미지로 재개할 수 있게 초안과 함께 보관한다.
            raw["_auto_publish"] = {"image_key": key, "image_error": result.image_error}
        draft_id = await self._drafts.save_text(
            target.session_id, target.student_id, result.text, raw
        )
        await self._drafts.save_image(draft_id, image_key=key, error=result.image_error)
        if approve:
            await self._draft_service.approve(draft_id)
            if self._onsite_photos:
                photo = await self._onsite_photos.get_current(target.student_id)
                if photo and photo.choice and result.image is not None:
                    try:
                        await self._draft_service.choose_card_photo(
                            target.student_id, use_ai=photo.choice == "ai"
                        )
                    except ConflictError:
                        if not await self._drafts.persona_photo_chosen(target.session_id):
                            raise
        return draft_id

    async def resume_publication(self, target: DraftTarget) -> UUID | None:
        """자동 승인 도중 중단된 초안만 복구한다. 수동 검수 초안은 건드리지 않는다."""
        draft = await self._drafts.get_by_session(target.session_id)
        if draft is None or draft.status != "pending":
            return None
        saved = draft.raw.get("_auto_publish")
        if not isinstance(saved, dict):
            return None
        await self._drafts.save_image(
            draft.id, image_key=saved.get("image_key"), error=saved.get("image_error")
        )
        await self._draft_service.approve(draft.id)
        return draft.id

    async def _persona(self, session_id: UUID) -> tuple[dict[str, Any], float | None]:
        system, user = await self._draft_service.persona_prompts(session_id)
        resp = await self._ai.chat(
            AIPurpose.PERSONA,
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            model=self.persona_model,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "persona", "strict": True, "schema": PERSONA_OUTPUT_SCHEMA},
            },
            extra_body={"usage": {"include": True}},  # OpenRouter 실제 청구액(usage.cost)
        )
        result = json.loads(resp.choices[0].message.content or "")
        if not isinstance(result, dict):
            raise ValueError("페르소나 응답이 JSON 객체가 아닙니다.")
        return result, getattr(resp.usage, "cost", None)

    async def _image(self, student: StudentRecord) -> GeneratedImage:
        if not student.photo_key:
            raise ExternalServiceError("원본 사진 없음")
        if self._onsite_photos:
            prepared = await self._onsite_photos.get_current(student.id)
            if prepared and prepared.photo_key == student.photo_key:
                if prepared.choice == "character" or prepared.status == "refused":
                    raise ImageRefusedError(
                        "현장 참여자가 유성이 사진을 선택했거나 사진 생성이 거절됐습니다."
                    )
                if prepared.status == "ready" and prepared.image_key:
                    return GeneratedImage(await self._storage.download(prepared.image_key), None)
                if prepared.status == "failed":
                    raise ExternalServiceError(
                        "현장 사진 생성에 실패했습니다. 운영진 확인이 필요합니다."
                    )
                # 사전 생성과 중복으로 과금하지 않고 준비된 결과를 기다린다.
                raise ImageQuotaError("현장 사진 생성 결과를 기다리고 있습니다.")
        photo = await self._storage.download(student.photo_key)
        return await vertex_future_photo(self._vertex, photo, DEFAULT_FUTURE_PHOTO_PROMPT)


async def _timed[T](coro: Awaitable[T]) -> tuple[T | None, Exception | None, float]:
    """(결과, 실패 예외, 걸린 초). 실패를 삼켜 다른 쪽 생성 결과를 살린다."""
    started = time.perf_counter()
    try:
        result: T | None = await coro
        error = None
    except Exception as exc:
        result, error = None, exc
    return result, error, round(time.perf_counter() - started, 2)


def _reason(exc: Exception | None) -> str | None:
    return str(exc)[:500] if exc is not None else None
