"""/api/sessions — 질문 진행, 답변 저장, 다음 질문(짧은 AI 동기)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


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
