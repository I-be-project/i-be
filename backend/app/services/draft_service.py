"""페르소나·카드 초안 — 생성(codex)·승인(카드 합성) 로직.

일괄 스크립트(scripts/batch_drafts.py)와 검수 화면(/api/dev/drafts)이 같은 경로를 쓴다.
codex는 로컬 전용이라 이 서비스도 로컬에서만 돈다.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from app.adapters.codex_client import CodexClient
from app.adapters.storage_client import StorageClient
from app.core.errors import NotFoundError
from app.core.images import crop_top
from app.core.logging import get_logger
from app.core.prompts.future_photo_prompt import (
    DEFAULT_FUTURE_PHOTO_PROMPT,
    LAYOUT_REFERENCE_IMAGE,
    PHOTO_RATIO,
)
from app.core.prompts.persona_prompt import (
    DEFAULT_SYSTEM_PROMPT,
    PERSONA_OUTPUT_SCHEMA,
    build_user_prompt,
)
from app.repositories.draft_repo import DraftRecord, DraftRepository, DraftText
from app.repositories.session_repo import SessionRepository
from app.repositories.student_repo import StudentRepository
from app.services.dev_service import build_persona_inputs
from app.services.id_card_renderer import IdCardContent, render_id_card

logger = get_logger(__name__)


def split_headline(name: str, base_career: str) -> str:
    """persona_name에서 직업명을 떼어 카드 윗줄(수식어)을 만든다.

    "아이디어를 비행으로 구현하는 드론 전문가" + "드론 전문가" → "아이디어를 비행으로 구현하는".
    직업명으로 끝나지 않으면 떼어낼 수 없으니 이름 전체를 쓴다 — 검수자가 고친다.
    """
    name, base_career = name.strip(), base_career.strip()
    if base_career and name.endswith(base_career):
        return name[: -len(base_career)].strip()
    return name


def to_draft_text(result: dict[str, Any]) -> DraftText:
    name = str(result.get("persona_name", ""))
    base_career = str(result.get("career_name", ""))
    return DraftText(
        name=name,
        base_career=base_career,
        headline=split_headline(name, base_career),
        tagline=str(result.get("short_description", "")),
        # v40 출력엔 Pool 내 여부가 없다 — Pool은 정답표가 아니라 참고 사전이 됐다.
        source_career_pool=None,
        pool_extended=None,
    )


def card_qr_data(qr_origin: str, card_code: str) -> str:
    # 공개 페이지(/p/<code>)로 연결. 짧게 둬야 QR이 성겨 인쇄 카드에서 읽힌다.
    return f"{qr_origin.rstrip('/')}/p/{card_code}"


class DraftService:
    def __init__(
        self,
        *,
        codex: CodexClient,
        storage: StorageClient,
        sessions: SessionRepository,
        drafts: DraftRepository,
        students: StudentRepository,
        qr_origin: str,
    ) -> None:
        self._codex = codex
        self._storage = storage
        self._sessions = sessions
        self._students = students
        self._drafts = drafts
        self._qr_origin = qr_origin

    async def _require(self, draft_id: UUID) -> DraftRecord:
        draft = await self._drafts.get(draft_id)
        if draft is None:
            raise NotFoundError("초안을 찾을 수 없습니다.")
        return draft

    async def generate_text(self, session_id: UUID, student_id: UUID) -> UUID:
        """세션 답변 → 페르소나 텍스트 → 초안 저장. 초안 id 반환."""
        records = await self._sessions.list_answers(session_id)
        inputs = build_persona_inputs({r.stage: r.payload for r in records}, career_pool=[])
        user_prompt = build_user_prompt(
            riasec_scores=inputs.riasec_scores,
            pair_code=inputs.pair_code,
            career_pool=inputs.career_pool,
            q7a_first=inputs.q7a_first,
            q7a_second=inputs.q7a_second,
            q7b_first=inputs.q7b_first,
            q7b_second=inputs.q7b_second,
            q8_response=inputs.q8_response,
            q9_response=inputs.q9_response,
            q1to6_texts=inputs.q1to6_texts,
        )
        result = await self._codex.generate_json(
            f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n\n{user_prompt}", PERSONA_OUTPUT_SCHEMA
        )
        return await self._drafts.save_text(session_id, student_id, to_draft_text(result), result)

    async def regenerate_text(self, draft_id: UUID) -> None:
        draft = await self._require(draft_id)
        await self.generate_text(draft.session_id, draft.student_id)

    async def generate_image(self, draft_id: UUID) -> None:
        """원본 사진 → 10년 뒤 인물 이미지 → S3. 실패는 초안의 error에 남기고 삼킨다.

        일괄 생성에서 한 명의 이미지 실패가 전체를 멈추면 안 되고, 텍스트는 이미
        저장돼 있으니 검수 화면에서 이미지만 다시 만들면 된다.
        """
        draft = await self._require(draft_id)
        if not draft.photo_key:
            await self._drafts.save_image(draft_id, image_key=None, error="원본 사진 없음")
            return
        try:
            photo = await self._storage.download(draft.photo_key)
            image = await self._codex.generate_image(
                DEFAULT_FUTURE_PHOTO_PROMPT, photo=photo, layout=LAYOUT_REFERENCE_IMAGE.read_bytes()
            )
            image = crop_top(image, PHOTO_RATIO)
            # 재생성마다 새 키 — 이전 이미지를 덮어쓰지 않고 남긴다(사진 영구 보관).
            key = await self._storage.upload_generated_image(
                f"{draft.student_id}/{draft_id}-{uuid4().hex[:8]}.png",
                image,
                content_type="image/png",
            )
        except Exception as exc:
            logger.warning("draft.image.failed", draft_id=str(draft_id), error=str(exc))
            await self._drafts.save_image(draft_id, image_key=None, error=str(exc)[:500])
            return
        await self._drafts.save_image(draft_id, image_key=key, error=None)

    async def use_fallback(self, draft_id: UUID) -> None:
        """생성 이미지를 버리고 폴백 캐릭터로 — 생성은 됐지만 결과가 이상할 때."""
        await self._require(draft_id)
        await self._drafts.clear_image(draft_id)

    async def render_card(self, draft: DraftRecord) -> bytes:
        # 생성 이미지가 없으면 None → 렌더러가 폴백 캐릭터를 쓴다.
        image = await self._storage.download(draft.image_key) if draft.image_key else None
        return render_id_card(
            image,
            IdCardContent(
                student_name=draft.student_name,
                school=draft.school,
                grade=draft.grade,
                class_no=draft.class_no,
                student_no=draft.student_no,
                headline=draft.headline,
                base_career=draft.base_career,
                qr_data=await self.card_qr_url(draft.student_id),
            ),
        )

    async def card_qr_url(self, student_id: UUID) -> str:
        """카드 QR에 담기는 공개 페이지 주소. 코드가 없으면 이때 발급된다."""
        code = await self._students.ensure_card_code(student_id)
        return card_qr_data(self._qr_origin, code)

    async def preview_card(self, draft_id: UUID) -> tuple[bytes, str]:
        """(카드 PNG, QR 주소). 검수 화면이 QR 링크를 직접 열어볼 수 있게 함께 준다."""
        draft = await self._require(draft_id)
        return await self.render_card(draft), await self.card_qr_url(draft.student_id)

    async def approve(self, draft_id: UUID) -> str:
        """카드 합성 → S3 cards/ → 확정본 기록. 카드 S3 키 반환."""
        draft = await self._require(draft_id)
        key = await self.upload_card(draft)
        await self._drafts.approve(draft, card_key=key)
        return key

    async def upload_card(self, draft: DraftRecord) -> str:
        """카드 합성 → S3 cards/. 키가 초안마다 고정이라 다시 부르면 같은 파일을 덮어쓴다.

        배치 상수(id_card_renderer)를 바꾼 뒤 승인된 카드를 다시 만들 때도 이 경로를 쓴다
        (scripts/rerender_cards.py). DB의 card_image_key는 그대로라 따로 고칠 게 없다.
        """
        png = await self.render_card(draft)
        return await self._storage.upload_card_image(
            f"{draft.student_id}/{draft.id}.png", png, content_type="image/png"
        )
