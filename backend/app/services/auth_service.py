"""학생 등록·토큰 발급 비즈니스 로직."""

from __future__ import annotations


class AuthService:
    """등록 + 동의 검증 + 사진 업로드 + 학생 세션 토큰 발급."""

    async def register_student(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
