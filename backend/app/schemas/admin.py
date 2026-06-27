"""admin 라우터용 Request/Response 모델."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    admin_token: str = Field(..., description="관리자 세션 JWT (Bearer)")
