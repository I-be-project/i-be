"""/api/generate/{stage} — Q7-B/Q8/Q9 stateless 생성 엔드포인트."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.deps import AIClientDep
from app.schemas.questions import GenerateInput
from app.services.question_service import generate_stage

router = APIRouter(prefix="/api/generate", tags=["questions"])


@router.post("/{stage}")
async def generate(stage: str, body: GenerateInput, ai: AIClientDep) -> dict[str, Any]:
    """stage에 맞는 질문 후보를 AI로 생성해 raw JSON dict를 반환한다.

    stage ∈ {q7b, q8, q9}.
    알 수 없는 stage → 404 / AI 오류 → 502.
    """
    return await generate_stage(ai, stage, body)
