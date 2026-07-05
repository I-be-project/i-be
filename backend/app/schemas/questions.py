"""Q7-B/Q8/Q9 생성 엔드포인트 요청·응답 스키마."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# 허용된 stage 값
VALID_STAGES = frozenset({"q7b", "q8", "q9"})


class GenerateInput(BaseModel):
    """POST /api/generate/{stage} 요청 본문.

    프론트엔드가 camelCase로 전송하므로 alias로 매핑한다.
    stage에 따라 일부 필드는 null 가능.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    riasec_scores: dict[str, int] = Field(alias="riasecScores")
    pair_code: str = Field(alias="pairCode")
    q1to6: list[str] = Field(alias="q1to6")
    q7a_first: str = Field(alias="q7aFirst")
    q7a_second: str = Field(alias="q7aSecond")

    # stage-dependent 필드 — 항상 선택적
    q7b_first: dict[str, Any] | None = Field(default=None, alias="q7bFirst")
    q7b_second: dict[str, Any] | None = Field(default=None, alias="q7bSecond")
    q8: dict[str, Any] | None = Field(default=None, alias="q8")
    q9: dict[str, Any] | None = Field(default=None, alias="q9")
    career_pool: list[str] | None = Field(default=None, alias="careerPool")
