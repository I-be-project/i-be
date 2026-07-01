"""/api/sessions — 세션 완료 저장, (미구현) 질문 진행·답변."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.deps import CurrentStudentDep, SessionServiceDep
from app.schemas.persona import Persona
from app.schemas.students import ProfileSummary

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/complete", response_model=ProfileSummary)
async def complete_survey(
    student_id: CurrentStudentDep,
    sessions: SessionServiceDep,
    persona: Persona,
) -> ProfileSummary:
    """페르소나 선택 확정 → 완료 세션 + 페르소나 저장 후 프로필 요약 반환.

    이미 완료 + retry off → 409.
    """
    return await sessions.complete_survey(student_id, persona)


@router.post("")
async def start_session() -> dict[str, str]:
    """입력 모드 선택 후 세션 생성."""
    raise NotImplementedError


@router.get("/{session_id}/next-question")
async def next_question(session_id: UUID) -> dict[str, object]:
    """다음 질문 반환. 적응형/최종 질문은 AI 호출(동기) 후 응답."""
    raise NotImplementedError


@router.post("/{session_id}/answers")
async def submit_answer(session_id: UUID) -> dict[str, object]:
    """현재 질문에 대한 답변 저장.

    Q6 제출 시 AI-01(해석) + AI-02(Q7~9 생성)를 동기로 호출하고 결과 함께 반환.
    """
    raise NotImplementedError
