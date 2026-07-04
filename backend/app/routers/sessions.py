"""/api/sessions — 진행 중 답변 저장, 세션 완료 저장."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.core.errors import DomainError
from app.deps import CurrentStudentDep, SessionServiceDep
from app.schemas.sessions import (
    ANSWER_STAGES,
    CompleteRequest,
    SaveAnswerRequest,
    SaveAnswerResponse,
)
from app.schemas.students import ProfileSummary

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class InvalidStageError(DomainError):
    status_code = 422
    code = "invalid_stage"


@router.post("/answers", response_model=SaveAnswerResponse)
async def submit_answer(
    student_id: CurrentStudentDep,
    sessions: SessionServiceDep,
    body: SaveAnswerRequest,
) -> SaveAnswerResponse:
    """진행 중(Q7~9) 답변을 저장한다. Q1~6은 저장하지 않는다.

    session_id가 없으면 in_progress 세션을 새로 만들어 그 id를 응답으로 돌려주고,
    이후 저장·완료 호출은 그 세션 id를 재사용한다.
    """
    if body.stage not in ANSWER_STAGES:
        raise InvalidStageError(
            f"저장할 수 없는 stage입니다: {body.stage}",
            details={"allowed": sorted(ANSWER_STAGES)},
        )
    session_id = await sessions.submit_answer(
        student_id, body.session_id, body.stage, body.answer
    )
    return SaveAnswerResponse(session_id=session_id)


@router.post("/complete", response_model=ProfileSummary)
async def complete_survey(
    student_id: CurrentStudentDep,
    sessions: SessionServiceDep,
    body: CompleteRequest,
) -> ProfileSummary:
    """페르소나 선택 확정 → 완료 세션 + 페르소나 저장 후 프로필 요약 반환.

    session_id가 있으면 그 in_progress 세션(진행 중 답변 포함)을 completed로 승격한다.
    이미 완료 + retry off → 409.
    """
    return await sessions.complete_survey(student_id, body, session_id=body.session_id)


@router.get("/{session_id}/next-question")
async def next_question(session_id: UUID) -> dict[str, object]:
    """다음 질문 반환. 적응형/최종 질문은 AI 호출(동기) 후 응답."""
    raise NotImplementedError
