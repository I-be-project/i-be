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
from app.repositories.booth_repo import BoothRepository
from app.repositories.booth_visit_repo import BoothVisitRepository
from app.repositories.card_repo import CardRepository
from app.repositories.persona_repo import PersonaRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.settings_repo import SettingsRepository
from app.repositories.student_repo import StudentRepository
from app.services.admin_service import AdminService
from app.services.auth_service import AuthService
from app.services.booth_service import BoothService
from app.services.booth_visit_service import BoothVisitService
from app.services.operator_service import OperatorService
from app.services.session_service import SessionService


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


def get_session_repo(pool: DBPoolDep) -> SessionRepository:
    return SessionRepository(pool)


def get_persona_repo(pool: DBPoolDep) -> PersonaRepository:
    return PersonaRepository(pool)


def get_card_repo(pool: DBPoolDep) -> CardRepository:
    return CardRepository(pool)


def get_settings_repo(pool: DBPoolDep) -> SettingsRepository:
    return SettingsRepository(pool)


def get_session_service(
    students: StudentRepoDep,
    sessions: Annotated[SessionRepository, Depends(get_session_repo)],
    personas: Annotated[PersonaRepository, Depends(get_persona_repo)],
    cards: Annotated[CardRepository, Depends(get_card_repo)],
    settings_repo: Annotated[SettingsRepository, Depends(get_settings_repo)],
    storage: StorageClientDep,
    settings: SettingsDep,
    db_pool: DBPoolDep,
    booths: Annotated[BoothRepository, Depends(get_booth_repo)],
    visits: Annotated[BoothVisitRepository, Depends(get_booth_visit_repo)],
) -> SessionService:
    return SessionService(
        students=students,
        sessions=sessions,
        personas=personas,
        cards=cards,
        settings_repo=settings_repo,
        storage=storage,
        settings=settings,
        db_pool=db_pool,
        booths=booths,
        visits=visits,
    )


SessionServiceDep = Annotated[SessionService, Depends(get_session_service)]


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


def get_admin_service(
    students: StudentRepoDep,
    sessions: Annotated[SessionRepository, Depends(get_session_repo)],
    storage: StorageClientDep,
    settings: SettingsDep,
) -> AdminService:
    return AdminService(students=students, sessions=sessions, storage=storage, settings=settings)


AdminServiceDep = Annotated[AdminService, Depends(get_admin_service)]


def get_operator_service(settings: SettingsDep) -> OperatorService:
    return OperatorService(settings=settings)


OperatorServiceDep = Annotated[OperatorService, Depends(get_operator_service)]


def current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> str:
    """Authorization: Bearer <token>를 관리자 토큰으로 검증하고 username 반환."""
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    try:
        payload = decode_token(
            credentials.credentials,
            expected_kind=TokenKind.ADMIN,
            settings=settings,
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("유효하지 않은 토큰입니다.") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise UnauthorizedError("토큰에 관리자 식별자가 없습니다.")
    return subject


CurrentAdminDep = Annotated[str, Depends(current_admin)]


def current_staff(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> str:
    """admin 또는 operator 토큰을 허용하고 역할("admin"|"operator")을 반환.

    조회 전용 엔드포인트에만 쓴다. 삭제·생성·수정은 CurrentAdminDep을 그대로 둬야
    운영진이 API를 직접 호출해도 서버가 막는다.

    decode_token은 종류를 하나만 받으므로 두 종류를 차례로 시도한다. admin·operator는
    같은 jwt_secret을 쓰기 때문에 서명 검증은 한 번으로 끝나고, 차이는 kind 클레임뿐이다.
    """
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    for kind in (TokenKind.ADMIN, TokenKind.OPERATOR):
        try:
            decode_token(credentials.credentials, expected_kind=kind, settings=settings)
        except jwt.PyJWTError:
            continue
        return kind.value
    raise UnauthorizedError("유효하지 않은 토큰입니다.")


CurrentStaffDep = Annotated[str, Depends(current_staff)]


def get_booth_repo(pool: DBPoolDep) -> BoothRepository:
    return BoothRepository(pool)


def get_booth_service(
    booths: Annotated[BoothRepository, Depends(get_booth_repo)],
    settings: SettingsDep,
) -> BoothService:
    return BoothService(booths=booths, settings=settings)


BoothServiceDep = Annotated[BoothService, Depends(get_booth_service)]


def get_booth_visit_repo(pool: DBPoolDep) -> BoothVisitRepository:
    return BoothVisitRepository(pool)


def get_booth_visit_service(
    booths: Annotated[BoothRepository, Depends(get_booth_repo)],
    visits: Annotated[BoothVisitRepository, Depends(get_booth_visit_repo)],
    sessions: Annotated[SessionRepository, Depends(get_session_repo)],
) -> BoothVisitService:
    return BoothVisitService(booths=booths, visits=visits, sessions=sessions)


BoothVisitServiceDep = Annotated[BoothVisitService, Depends(get_booth_visit_service)]
