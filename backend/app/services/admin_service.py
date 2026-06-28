"""관리자 인증·조회 서비스."""

from __future__ import annotations

import secrets
from datetime import timedelta

from app.adapters.storage_client import StorageClient
from app.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.student_repo import StudentRepository
from app.schemas.admin import AdminStudentItem, AdminStudentList


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

    # 사진 presigned URL 유효시간 (1시간) — 관리자 조회 세션에 충분.
    _PHOTO_URL_TTL_SECONDS = 3600

    async def list_students(
        self,
        *,
        q: str | None,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        limit: int,
        offset: int,
    ) -> AdminStudentList:
        total, records = await self._students.list_students(
            q=q, school=school, grade=grade, class_no=class_no, limit=limit, offset=offset
        )
        items: list[AdminStudentItem] = []
        for r in records:
            photo_url: str | None = None
            if r.photo_key:
                try:
                    photo_url = await self._storage.create_signed_url(
                        r.photo_key, ttl_seconds=self._PHOTO_URL_TTL_SECONDS
                    )
                except Exception:  # noqa: BLE001 — 사진 1건 실패가 목록 전체를 막지 않도록.
                    photo_url = None
            items.append(
                AdminStudentItem(
                    id=r.id,
                    school=r.school,
                    grade=r.grade,
                    class_no=r.class_no,
                    student_no=r.student_no,
                    name=r.name,
                    password=r.password,
                    photo_url=photo_url,
                    consent_privacy=r.consent_privacy,
                    created_at=r.created_at,
                )
            )
        return AdminStudentList(total=total, items=items)
