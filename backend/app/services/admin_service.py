"""관리자 인증·조회 서비스."""

from __future__ import annotations

import secrets
from datetime import timedelta

from app.adapters.storage_client import StorageClient
from app.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.student_repo import StudentRepository


class AdminService:
    def __init__(
        self,
        *,
        students: StudentRepository,
        storage: StorageClient,
        settings: Settings,
    ) -> None:
        self._students = students
        self._storage = storage
        self._settings = settings

    def authenticate(self, username: str, password: str) -> str:
        """단일 관리자 계정 검증 후 admin 토큰 발급. 실패 시 UnauthorizedError."""
        # 타이밍 공격 완화를 위해 compare_digest 사용.
        ok_user = secrets.compare_digest(username, self._settings.admin_username)
        ok_pass = secrets.compare_digest(password, self._settings.admin_password)
        if not (ok_user and ok_pass):
            raise UnauthorizedError("아이디 또는 비밀번호가 올바르지 않습니다.")
        return create_token(
            kind=TokenKind.ADMIN,
            subject=username,
            ttl=timedelta(hours=self._settings.admin_token_ttl_hours),
            settings=self._settings,
        )
