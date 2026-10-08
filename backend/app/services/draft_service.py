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
from app.core.images import crop_top, to_codex_input
from app.core.logging import get_logger
from app.core.prompts.future_photo_prompt import (
    BACKGROUND_IMAGE,
    DEFAULT_FUTURE_PHOTO_PROMPT,
    LAYOUT_REFERENCE_IMAGE,
    PHOTO_RATIO,
    with_review_feedback,
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

    async def generate_text(
        self, session_id: UUID, student_id: UUID, *, feedback: str | None = None
    ) -> UUID:
        """세션 답변 → 페르소나 텍스트 → 초안 저장. 초안 id 반환.

        feedback: 다시 쓸 때 붙이는 이전 결과와 검수 의견(_text_feedback).
        """
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
        if feedback:
            user_prompt += f"\n\n{feedback}"
        result = await self._codex.generate_json(
            f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n\n{user_prompt}", PERSONA_OUTPUT_SCHEMA
        )
        return await self._drafts.save_text(session_id, student_id, to_draft_text(result), result)

    async def regenerate_text(self, draft_id: UUID) -> None:
        draft = await self._require(draft_id)
        await self._drafts.mark_regenerated(draft_id)
        # △ 받은 초안이면 그 이유와 이전 결과를 함께 줘서 고쳐 쓰게 한다.
        reason = draft.verdict_reason.strip() if draft.verdict == "triangle" else ""
        feedback = _text_feedback(draft, reason) if reason else None
        await self.generate_text(draft.session_id, draft.student_id, feedback=feedback)

    async def generate_image(self, draft_id: UUID, *, feedback: str | None = None) -> None:
        """원본 사진 → 10년 뒤 인물 이미지 → S3. 실패는 초안의 error에 남기고 삼킨다.

        일괄 생성에서 한 명의 이미지 실패가 전체를 멈추면 안 되고, 텍스트는 이미
        저장돼 있으니 검수 화면에서 이미지만 다시 만들면 된다.
        """
        draft = await self._require(draft_id)
        if not draft.photo_key:
            await self._drafts.save_image(draft_id, image_key=None, error="원본 사진 없음")
            return
        # △ 받은 초안은 따로 주지 않아도 그 이유를 반영한다(검수 화면의 단건 재생성).
        if feedback is None and draft.verdict == "triangle" and draft.verdict_reason.strip():
            feedback = draft.verdict_reason.strip()
        prompt = (
            with_review_feedback(DEFAULT_FUTURE_PHOTO_PROMPT, feedback)
            if feedback
            else DEFAULT_FUTURE_PHOTO_PROMPT
        )
        try:
            photo = to_codex_input(await self._storage.download(draft.photo_key))
            image = await self._codex.generate_image(
                prompt,
                photo=photo,
                layout=LAYOUT_REFERENCE_IMAGE.read_bytes(),
                background=BACKGROUND_IMAGE.read_bytes(),
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

    async def regenerate_image(self, draft_id: UUID) -> None:
        """검수 화면에서 이미지만 다시 만든다 — 재검수 대상으로 기록한다."""
        await self._drafts.mark_regenerated(draft_id)
        await self.generate_image(draft_id)

    async def regenerate_from_review(self, draft_id: UUID) -> None:
        """△ 이유를 보고 텍스트·이미지 중 필요한 것을 다시 만든다(이유를 프롬프트에 반영).

        이미지 먼저 — 새 이미지·텍스트가 저장되면 평가가 지워지므로 이유는 처음에 읽어 둔다.
        """
        draft = await self._require(draft_id)
        reason = draft.verdict_reason.strip() if draft.verdict == "triangle" else ""
        text, image = review_targets(reason)
        await self._drafts.mark_regenerated(draft_id)
        if image:
            await self.generate_image(draft_id, feedback=reason or None)
        if text:
            await self.generate_text(
                draft.session_id, draft.student_id, feedback=_text_feedback(draft, reason)
            )

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


# △ 이유로 무엇을 다시 만들지 고른다. △는 "애매한 사진 결과"라 기본은 이미지이고,
# 직업·문구를 짚은 이유만 텍스트를 다시 쓴다. 둘 다 짚으면 둘 다.
_TEXT_HINTS = ("직업", "페르소나", "문구", "설명", "수식어", "역량")
_IMAGE_HINTS = (
    "얼굴", "사진", "이미지", "머리", "헤어", "수염", "피부", "닮", "성별", "표정",
    "눈", "입", "화질", "메이크업", "안경", "그림자", "남자", "여자", "어려", "나이",
)  # fmt: skip


def review_targets(reason: str) -> tuple[bool, bool]:
    """(텍스트를 다시 쓸지, 이미지를 다시 만들지)."""
    text = any(h in reason for h in _TEXT_HINTS)
    image = not text or any(h in reason for h in _IMAGE_HINTS)
    return text, image


def _text_feedback(draft: DraftRecord, reason: str) -> str:
    return f"""[검수 피드백 — 이전 결과를 다시 쓴다]
- 이전 결과: {draft.name} / {draft.tagline}
- 검수 의견: "{reason}"
이 의견이 가리키는 문제를 고쳐 다시 작성한다. 출력 형식과 규칙은 그대로 따른다."""
