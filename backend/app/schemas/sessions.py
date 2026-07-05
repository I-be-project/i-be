"""/api/sessions 요청·응답 스키마 (답변 저장, 완료)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.persona import Persona

# 저장을 허용하는 stage. q1to6은 Q1~6 결과를 한 번에 담고, q7a~q9는 단계별.
# q9가 마지막 질문이며, 이후 /complete로 세션을 완료한다.
ANSWER_STAGES = frozenset({"q1to6", "q7a", "q7b", "q8", "q9"})


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


class CompleteRequest(BaseModel):
    """POST /api/sessions/complete 요청 본문.

    학생 흐름은 Q9가 마지막이라 persona 없이 세션만 completed로 승격한다.
    이때 name을 비우면(또는 생략) 페르소나를 저장하지 않고, 이름·카드는 이후
    (한마당)에 생성·공개한다. persona(name/tagline/keywords/fields)를 함께 넘기면
    저장한다. session_id가 있으면 그 in_progress 세션을 승격하고, 없으면 새로 만든다.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str | None = Field(default=None, max_length=60)
    tagline: str = Field(default="", max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=8)
    fields: list[str] = Field(default_factory=list, max_length=8)
    session_id: UUID | None = Field(default=None, alias="sessionId")

    def to_persona(self) -> Persona | None:
        """name이 있으면 Persona로 변환하고, 없으면 None(페르소나 미저장 완료)."""
        if not self.name or not self.name.strip():
            return None
        return Persona(
            name=self.name,
            tagline=self.tagline,
            keywords=self.keywords,
            fields=self.fields,
        )
