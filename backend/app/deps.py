"""FastAPI 의존성 주입.

- DB 풀, AI 클라이언트, Storage 클라이언트는 lifespan에서 1회 생성된 인스턴스를 공유한다.
- 라우터에서는 Annotated[X, Depends(get_x)] 형태로 사용.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.adapters.ai_client import AIClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, decode_token
from app.repositories.student_repo import StudentRepository
from app.services.auth_service import AuthService


def get_db_pool(request: Request) -> DBPool:
    pool: DBPool | None = request.app.state.db_pool
    if pool is None:
        raise RuntimeError("DATABASE_ENABLED=false 상태에서는 DB 풀을 사용할 수 없습니다.")
    return pool


def get_ai_client(request: Request) -> AIClient:
    client: AIClient = request.app.state.ai_client
    return client


SettingsDep = Annotated[Settings, Depends(get_settings)]
DBPoolDep = Annotated[DBPool, Depends(get_db_pool)]
AIClientDep = Annotated[AIClient, Depends(get_ai_client)]


def get_storage_client(settings: SettingsDep) -> StorageClient:
    return StorageClient.from_settings(settings)


StorageClientDep = Annotated[StorageClient, Depends(get_storage_client)]


def get_student_repo(pool: DBPoolDep) -> StudentRepository:
    return StudentRepository(pool)


StudentRepoDep = Annotated[StudentRepository, Depends(get_student_repo)]


def get_auth_service(
    students: StudentRepoDep,
    storage: StorageClientDep,
    settings: SettingsDep,
) -> AuthService:
    return AuthService(students=students, storage=storage, settings=settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


_bearer = HTTPBearer(auto_error=False)


def current_student(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> UUID:
    """Authorization: Bearer <token>를 학생 토큰으로 검증하고 student_id 반환.

    토큰이 없거나 검증 실패(잘못된 종류·만료·서명 등) 시 UnauthorizedError.
    """
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    try:
        payload = decode_token(
            credentials.credentials,
            expected_kind=TokenKind.STUDENT,
            settings=settings,
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("유효하지 않은 토큰입니다.") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise UnauthorizedError("토큰에 학생 식별자가 없습니다.")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise UnauthorizedError("토큰 학생 식별자가 올바르지 않습니다.") from exc


CurrentStudentDep = Annotated[UUID, Depends(current_student)]
