"""/api/generate/{stage} — Q7-B/Q8/Q9 stateless 생성 엔드포인트."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AIClientDep, CurrentStudentDep
from app.schemas.questions import GenerateInput
from app.services.question_service import generate_stage

router = APIRouter(prefix="/api/generate", tags=["questions"])


@router.post("/{stage}")
async def generate(
    stage: str,
    body: GenerateInput,
    ai: AIClientDep,
    _student_id: CurrentStudentDep,
) -> dict:
    """stage에 맞는 질문 후보를 AI로 생성해 raw JSON dict를 반환한다.

    stage ∈ {q7b, q8, q9}.
    stateless라 student_id를 쓰진 않지만, AI(유료) 호출 남용을 막기 위해
    학생 토큰을 요구한다(무인증 → 401). 토큰 없음/무효 → 401.
    알 수 없는 stage → 404 / AI 오류 → 502.
    """
    return await generate_stage(ai, stage, body)
