"""/api/dev — 개발·실험용 엔드포인트.

로컬 Codex CLI(`codex exec`)로만 동작한다. OpenRouter(AIClient)는 쓰지 않는다.
배포 서버엔 codex 바이너리가 없고 이 라우터는 인증도 없다 —
등록 자체를 APP_ENV=local로 제한한다(main.create_app).

- GET  /students              학생 선택 목록
- GET  /students/{id}/answers 선택한 학생의 최근 세션 답변(프롬프트 입력 미리보기)
- GET  /prompts               편집기 초깃값
- POST /persona               답변 + 편집한 시스템 프롬프트 → Career Persona
- POST /future-photo          학생 사진 + 편집한 프롬프트 → 10년 뒤 사진
"""

from __future__ import annotations

import base64
import time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.adapters.storage_client import StorageClient
from app.core.errors import NotFoundError
from app.core.images import inspect_image
from app.core.prompts.future_photo_prompt import DEFAULT_FUTURE_PHOTO_PROMPT
from app.core.prompts.persona_prompt import (
    DEFAULT_SYSTEM_PROMPT,
    PERSONA_OUTPUT_SCHEMA,
    build_user_prompt,
)
from app.deps import (
    CodexClientDep,
    DraftRepoDep,
    DraftServiceDep,
    StorageClientDep,
    StudentRepoDep,
    get_session_repo,
)
from app.repositories.draft_repo import DraftRecord, DraftText
from app.repositories.session_repo import SessionRepository
from app.schemas.dev import (
    BatchRequest,
    BatchStatus,
    CardPreview,
    DefaultPromptsResponse,
    DevClass,
    DevStudent,
    DevStudentList,
    DraftItem,
    DraftList,
    DraftUpdate,
    GenerateFuturePhotoRequest,
    GenerateFuturePhotoResponse,
    GeneratePersonaRequest,
    GeneratePersonaResponse,
    StudentAnswersResponse,
)
from app.services.dev_service import build_persona_inputs
from app.services.draft_batch import dev_batch

# 원본 사진 Presigned URL 유효시간. admin과 같은 1시간 — dev 세션에 충분하다.
_PHOTO_URL_TTL_SECONDS = 3600

router = APIRouter(prefix="/api/dev", tags=["dev"])

SessionRepoDep = Annotated[SessionRepository, Depends(get_session_repo)]


@router.get("/prompts", response_model=DefaultPromptsResponse)
async def get_default_prompts() -> DefaultPromptsResponse:
    """화면의 프롬프트 편집기 초깃값."""
    return DefaultPromptsResponse(
        persona_system_prompt=DEFAULT_SYSTEM_PROMPT,
        future_photo_prompt=DEFAULT_FUTURE_PHOTO_PROMPT,
    )


@router.get("/students", response_model=DevStudentList)
async def list_students(
    students: StudentRepoDep,
    sessions: SessionRepoDep,
    storage: StorageClientDep,
    q: Annotated[str | None, Query(description="이름 부분 일치")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> DevStudentList:
    """학생 선택 목록. 페르소나·사진 생성 가능 여부와 원본 사진 URL을 함께 내린다."""
    _, records = await students.list_students(
        q=q, school=None, grade=None, class_no=None, limit=limit, offset=0, sort="created_desc"
    )
    progress = await sessions.get_progress_for_students([r.id for r in records])
    # 건별로 서명하면 클라이언트 생성 비용(40~50ms)이 건마다 붙는다 — 한 번에 서명한다.
    photo_urls = await storage.create_signed_urls(
        [r.photo_key for r in records if r.photo_key], ttl_seconds=_PHOTO_URL_TTL_SECONDS
    )
    return DevStudentList(
        students=[
            DevStudent(
                id=r.id,
                name=r.name,
                school=r.school,
                grade=r.grade,
                class_no=r.class_no,
                student_no=r.student_no,
                has_photo=bool(r.photo_key),
                photo_url=photo_urls.get(r.photo_key) if r.photo_key else None,
                has_answers=bool(progress[r.id].stages) if r.id in progress else False,
            )
            for r in records
        ]
    )


@router.get("/students/{student_id}/answers", response_model=StudentAnswersResponse)
async def get_student_answers(student_id: UUID, sessions: SessionRepoDep) -> StudentAnswersResponse:
    """학생의 최근 세션 답변을 프롬프트 슬롯 형태로 반환.

    career_pool은 Pair Code의 기본 풀이다 — 화면에서 편집할 초깃값.
    """
    session = await sessions.get_latest_for_student(student_id)
    if session is None:
        return StudentAnswersResponse(
            session_id=None,
            status=None,
            riasec_scores={},
            pair_code="",
            career_pool=[],
            q7a_first=None,
            q7a_second=None,
            q7b_first=None,
            q7b_second=None,
            q8_response=None,
            q9_response=None,
        )

    records = await sessions.list_answers(session.id)
    inputs = build_persona_inputs({r.stage: r.payload for r in records}, career_pool=[])
    return StudentAnswersResponse(
        session_id=session.id,
        status=session.status,
        riasec_scores=inputs.riasec_scores,
        pair_code=inputs.pair_code,
        career_pool=inputs.career_pool,
        q7a_first=inputs.q7a_first,
        q7a_second=inputs.q7a_second,
        q7b_first=inputs.q7b_first,
        q7b_second=inputs.q7b_second,
        q8_response=inputs.q8_response,
        q9_response=inputs.q9_response,
    )


@router.post("/persona", response_model=GeneratePersonaResponse)
async def generate_persona(
    req: GeneratePersonaRequest, sessions: SessionRepoDep, codex: CodexClientDep
) -> GeneratePersonaResponse:
    """저장된 답변 + 편집한 시스템 프롬프트 → Career Persona 1개 (codex, 이미지 없음)."""
    session = await sessions.get_latest_for_student(req.student_id)
    if session is None:
        raise NotFoundError("이 학생에게는 설문 세션이 없습니다.")

    records = await sessions.list_answers(session.id)
    inputs = build_persona_inputs(
        {r.stage: r.payload for r in records}, career_pool=req.career_pool
    )
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

    started = time.perf_counter()
    result = await codex.generate_json(
        f"{req.system_prompt}\n\n---\n\n{user_prompt}",
        PERSONA_OUTPUT_SCHEMA,
        model=req.model,
    )
    elapsed = time.perf_counter() - started

    return GeneratePersonaResponse(
        **result, user_prompt=user_prompt, elapsed_seconds=round(elapsed, 2)
    )


@router.post("/future-photo", response_model=GenerateFuturePhotoResponse)
async def generate_future_photo(
    req: GenerateFuturePhotoRequest,
    students: StudentRepoDep,
    storage: StorageClientDep,
    codex: CodexClientDep,
) -> GenerateFuturePhotoResponse:
    """학생의 저장된 사진 + 편집한 프롬프트 → 10년 뒤 사진 (codex)."""
    student = await students.get_by_id(req.student_id)
    if student is None:
        raise NotFoundError("학생을 찾을 수 없습니다.")
    if not student.photo_key:
        raise NotFoundError("이 학생에게는 저장된 사진이 없습니다.")

    photo = await storage.download(student.photo_key)

    started = time.perf_counter()
    image_bytes = await codex.generate_image(req.prompt, photo=photo, model=req.model)
    elapsed = time.perf_counter() - started

    info = inspect_image(image_bytes)
    return GenerateFuturePhotoResponse(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        size_bytes=len(image_bytes),
        width=info.width,
        height=info.height,
        elapsed_seconds=round(elapsed, 2),
    )


# ──────────────────────────────────────────────────────────────
# 검수 — scripts/batch_drafts.py가 만든 초안을 확인·수정·승인한다.
# ──────────────────────────────────────────────────────────────


def _draft_item(draft: DraftRecord, urls: dict[str, str]) -> DraftItem:
    return DraftItem(
        id=draft.id,
        student_id=draft.student_id,
        status=draft.status,
        student_name=draft.student_name,
        school=draft.school,
        grade=draft.grade,
        class_no=draft.class_no,
        student_no=draft.student_no,
        name=draft.name,
        base_career=draft.base_career,
        headline=draft.headline,
        tagline=draft.tagline,
        source_career_pool=draft.source_career_pool,
        pool_extended=draft.pool_extended,
        raw=draft.raw,
        photo_url=urls.get(draft.photo_key) if draft.photo_key else None,
        image_url=urls.get(draft.image_key) if draft.image_key else None,
        error=draft.error,
        note=draft.note,
    )


async def _draft_items(drafts: list[DraftRecord], storage: StorageClient) -> list[DraftItem]:
    keys = [k for d in drafts for k in (d.photo_key, d.image_key) if k]
    urls = await storage.create_signed_urls(keys, ttl_seconds=_PHOTO_URL_TTL_SECONDS)
    return [_draft_item(d, urls) for d in drafts]


async def _get_draft_item(
    draft_id: UUID, drafts: DraftRepoDep, storage: StorageClient
) -> DraftItem:
    draft = await drafts.get(draft_id)
    if draft is None:
        raise NotFoundError("초안을 찾을 수 없습니다.")
    return (await _draft_items([draft], storage))[0]


@router.get("/drafts", response_model=DraftList)
async def list_drafts(
    drafts: DraftRepoDep,
    storage: StorageClientDep,
    status: Annotated[Literal["pending", "approved", "rejected"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DraftList:
    """초안 목록(학교·학년·반·번호 순)과 상태별 개수."""
    records = await drafts.list_drafts(status=status, limit=limit, offset=offset)
    return DraftList(
        drafts=await _draft_items(records, storage), counts=await drafts.count_by_status()
    )


@router.patch("/drafts/{draft_id}", response_model=DraftItem)
async def update_draft(
    draft_id: UUID, req: DraftUpdate, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """카드 문구 수정. 상태는 그대로 — 승인은 따로 누른다."""
    if await drafts.get(draft_id) is None:
        raise NotFoundError("초안을 찾을 수 없습니다.")
    await drafts.update_text(
        draft_id,
        DraftText(
            name=req.name,
            base_career=req.base_career,
            headline=req.headline,
            tagline=req.tagline,
            source_career_pool=None,  # update_text는 문구 컬럼만 쓴다
            pool_extended=None,
        ),
        note=req.note,
    )
    return await _get_draft_item(draft_id, drafts, storage)


@router.post("/drafts/{draft_id}/regenerate-text", response_model=DraftItem)
async def regenerate_draft_text(
    draft_id: UUID, service: DraftServiceDep, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """페르소나 텍스트만 다시 생성(codex). 수정한 문구는 덮어써지고 검수 대기로 돌아간다."""
    await service.regenerate_text(draft_id)
    return await _get_draft_item(draft_id, drafts, storage)


@router.post("/drafts/{draft_id}/regenerate-image", response_model=DraftItem)
async def regenerate_draft_image(
    draft_id: UUID, service: DraftServiceDep, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """인물 이미지만 다시 생성(codex). 실패하면 기존 이미지를 두고 error에 사유를 남긴다."""
    await service.generate_image(draft_id)
    return await _get_draft_item(draft_id, drafts, storage)


@router.post("/drafts/{draft_id}/use-fallback", response_model=DraftItem)
async def use_fallback_image(
    draft_id: UUID, service: DraftServiceDep, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """생성 이미지 대신 폴백 캐릭터로 카드를 만든다."""
    await service.use_fallback(draft_id)
    return await _get_draft_item(draft_id, drafts, storage)


@router.get("/drafts/{draft_id}/card", response_model=CardPreview)
async def preview_draft_card(draft_id: UUID, service: DraftServiceDep) -> CardPreview:
    """현재 문구·이미지(없으면 폴백 캐릭터)로 합성한 카드 미리보기. 저장하지 않는다."""
    png = await service.preview_card(draft_id)
    return CardPreview(image_base64=base64.b64encode(png).decode("ascii"))


@router.post("/drafts/{draft_id}/approve", response_model=DraftItem)
async def approve_draft(
    draft_id: UUID, service: DraftServiceDep, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """카드 PNG 합성 → S3 cards/ → generated.personas·cards 확정."""
    await service.approve(draft_id)
    return await _get_draft_item(draft_id, drafts, storage)


@router.post("/drafts/{draft_id}/reject", response_model=DraftItem)
async def reject_draft(
    draft_id: UUID, drafts: DraftRepoDep, storage: StorageClientDep
) -> DraftItem:
    """반려. 일괄 생성이 다시 만들지 않는다 — 필요하면 재생성 버튼으로 되살린다."""
    if await drafts.get(draft_id) is None:
        raise NotFoundError("초안을 찾을 수 없습니다.")
    await drafts.reject(draft_id)
    return await _get_draft_item(draft_id, drafts, storage)


# ──────────────────────────────────────────────────────────────
# 일괄 생성 — 학교·학년·반을 골라 백엔드 백그라운드에서 초안을 만든다.
# ──────────────────────────────────────────────────────────────


@router.get("/schools", response_model=list[str])
async def list_schools(students: StudentRepoDep) -> list[str]:
    return await students.list_schools()


@router.get("/schools/classes", response_model=list[DevClass])
async def list_classes(
    students: StudentRepoDep, drafts: DraftRepoDep, school: Annotated[str, Query(min_length=1)]
) -> list[DevClass]:
    """학교의 반 목록 — 학생 수·설문 완료 수·일괄 생성 대상 수."""
    rows = await students.get_class_progress(school)
    targets = await drafts.count_targets_by_class(school)
    return [
        DevClass(
            grade=r.grade,
            class_no=r.class_no,
            total=r.total,
            completed=r.completed,
            targets=targets.get((r.grade, r.class_no), 0),
        )
        for r in rows
    ]


def _batch_status() -> BatchStatus:
    p = dev_batch.progress
    return BatchStatus(
        label=p.label,
        total=p.total,
        done=p.done,
        failed=p.failed,
        running=p.running,
        cancelled=p.cancelled,
        started_at=p.started_at,
        finished_at=p.finished_at,
        errors=p.errors,
    )


@router.get("/drafts/batch", response_model=BatchStatus)
async def get_batch_status() -> BatchStatus:
    return _batch_status()


@router.post("/drafts/batch", response_model=BatchStatus, status_code=202)
async def start_batch(
    req: BatchRequest, drafts: DraftRepoDep, service: DraftServiceDep
) -> BatchStatus:
    """선택한 반들의 대상 전원 초안 생성을 백그라운드로 시작한다. 동시에 한 작업만."""
    picked = dict.fromkeys((c.school, c.grade, c.class_no) for c in req.classes)  # 중복 제거
    targets = []
    for school, grade, class_no in picked:
        targets += await drafts.list_targets(
            limit=100_000, school=school, grade=grade, class_no=class_no
        )
    label = f"{len({p[0] for p in picked})}개 학교 · {len(picked)}개 반"
    dev_batch.start(service, targets, concurrency=req.concurrency, label=label)
    return _batch_status()


@router.post("/drafts/batch/cancel", response_model=BatchStatus)
async def cancel_batch() -> BatchStatus:
    """진행 중인 codex 호출까지 끊는다. 이미 저장된 초안은 남는다."""
    dev_batch.cancel()
    return _batch_status()
