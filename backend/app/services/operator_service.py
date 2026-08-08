"""운영진 인증 — 아이디 없이 공유 비밀번호 하나로 로그인한다.

계정 테이블을 두지 않으므로 누가 로그인했는지는 구분하지 않는다. 운영진에게는
조회 권한만 주고 쓰기는 관리자 토큰에만 열어 두는 것으로 위험을 제한한다.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from app.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, create_token


class OperatorService:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings

    def authenticate(self, password: str) -> str:
        """공유 비밀번호 검증 후 operator 토큰 발급. 실패 시 UnauthorizedError."""
        # 타이밍 공격 완화 — AdminService.authenticate와 같은 방식.
        # bytes로 인코딩 후 비교: compare_digest는 비-ASCII str 조합을 지원하지 않아
        # 한글 등 비밀번호를 그대로 넘기면 TypeError가 난다.
        if not secrets.compare_digest(password.encode(), self._settings.operator_password.encode()):
            raise UnauthorizedError("비밀번호가 올바르지 않습니다.")
        return create_token(
            kind=TokenKind.OPERATOR,
            subject="operator",
            ttl=timedelta(hours=self._settings.operator_token_ttl_hours),
            settings=self._settings,
        )
