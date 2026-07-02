"""/api/sessions 요청·응답 스키마 (답변 저장, 완료)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.persona import Persona

# 진행 중 저장을 허용하는 stage — Q1~6은 저장하지 않고, Q10은 persona로 승격한다.
ANSWER_STAGES = frozenset({"q7a", "q7b", "q8", "q9"})


class SaveAnswerRequest(BaseModel):
    """POST /api/sessions/answers 요청 본문.

    session_id가 없으면 새 in_progress 세션을 만들어 응답으로 돌려준다.
    answer에는 학생이 고른 값만 담는다(구조는 stage마다 다르므로 자유 dict).
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    session_id: UUID | None = Field(default=None, alias="sessionId")
    stage: str
    answer: dict[str, Any] = Field(default_factory=dict)


class SaveAnswerResponse(BaseModel):
    """저장된(또는 새로 만든) 세션 id. 프론트가 다음 저장·완료에 재사용한다."""

    session_id: UUID


class CompleteRequest(Persona):
    """POST /api/sessions/complete 요청 본문.

    Persona 필드(name/tagline/keywords/fields)에 더해, 진행 중 세션 id를 선택적으로 받는다.
    session_id가 있으면 그 in_progress 세션을 completed로 승격하고, 없으면 새 세션을 만든다.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    session_id: UUID | None = Field(default=None, alias="sessionId")
