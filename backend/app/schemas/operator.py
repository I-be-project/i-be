"""operator 라우터용 Request/Response 모델."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OperatorLoginRequest(BaseModel):
    """운영진 로그인 — 아이디 없이 공유 비밀번호 하나만 받는다."""

    password: str = Field(..., min_length=1, max_length=128)


class OperatorLoginResponse(BaseModel):
    operator_token: str = Field(..., description="운영진 세션 JWT (Bearer)")
