"""JWT 발급·검증과 비밀번호 해시.

토큰 종류:
- student: 학생 세션 (단기, app secret)
- card_share: 카드 영구 토큰 (별도 시크릿)
- share_link: 단기 공유 토큰
- operator: 운영자 세션
- admin: 관리자 세션
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.config import Settings


class TokenKind(StrEnum):
    STUDENT = "student"
    CARD_SHARE = "card_share"
    SHARE_LINK = "share_link"
    OPERATOR = "operator"
    ADMIN = "admin"


_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


def _secret_for(kind: TokenKind, settings: Settings) -> str:
    if kind is TokenKind.CARD_SHARE:
        return settings.jwt_card_share_secret
    return settings.jwt_secret


def create_token(
    *,
    kind: TokenKind,
    subject: str | UUID | None,
    claims: dict[str, Any] | None = None,
    ttl: timedelta | None = None,
    settings: Settings,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "iss": settings.jwt_issuer,
        "iat": int(now.timestamp()),
        "kind": kind.value,
    }
    if subject is not None:
        payload["sub"] = str(subject)
    if claims:
        payload.update(claims)
    if ttl is not None:
        payload["exp"] = int((now + ttl).timestamp())

    return jwt.encode(payload, _secret_for(kind, settings), algorithm="HS256")


def decode_token(
    token: str,
    *,
    expected_kind: TokenKind,
    settings: Settings,
) -> dict[str, Any]:
    """토큰 검증 후 payload 반환. 실패 시 jwt.PyJWTError 계열 예외 발생."""
    options = {"require": ["iss", "iat", "kind"]}
    if expected_kind is not TokenKind.CARD_SHARE:
        options["require"].append("exp")

    payload: dict[str, Any] = jwt.decode(
        token,
        _secret_for(expected_kind, settings),
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
        options=options,
    )

    if payload.get("kind") != expected_kind.value:
        raise jwt.InvalidTokenError(f"unexpected token kind: {payload.get('kind')}")

    return payload
