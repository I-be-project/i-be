"""운영 시크릿 가드 — APP_ENV=production에서 플레이스홀더 시크릿을 거부하는지 검증."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings

_REAL_SECRETS = {
    "JWT_SECRET": "b7f3d1c9a2e84f60b5d7c3a1e9f2b8d4",
    "JWT_CARD_SHARE_SECRET": "3a9e1f7c5b2d8046a1c7e3f9b5d2a806",
    "ADMIN_PASSWORD": "a-real-admin-password",
    "OPERATOR_PASSWORD": "a-real-operator-password",
    "FRONTEND_ORIGIN": "https://i-be.vercel.app",
}


def _use_production(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    """APP_ENV=production + 실제 시크릿을 깔고, overrides로 일부만 되돌린다."""
    monkeypatch.setenv("APP_ENV", "production")
    for name, value in {**_REAL_SECRETS, **overrides}.items():
        monkeypatch.setenv(name, value)


def test_production_with_real_secrets_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_production(monkeypatch)

    settings = Settings()

    assert settings.app_env == "production"
    assert settings.jwt_secret == _REAL_SECRETS["JWT_SECRET"]


@pytest.mark.parametrize(
    ("env_name", "field"),
    [
        ("JWT_SECRET", "jwt_secret"),
        ("JWT_CARD_SHARE_SECRET", "jwt_card_share_secret"),
        ("ADMIN_PASSWORD", "admin_password"),
        ("OPERATOR_PASSWORD", "operator_password"),
        ("FRONTEND_ORIGIN", "frontend_origin"),
    ],
)
def test_production_rejects_default_secret(
    monkeypatch: pytest.MonkeyPatch, env_name: str, field: str
) -> None:
    """시크릿 하나라도 기본값(공개된 플레이스홀더)이면 기동을 막는다."""
    default = str(Settings.model_fields[field].default)
    _use_production(monkeypatch, **{env_name: default})

    with pytest.raises(ValidationError) as exc:
        Settings()

    assert env_name in str(exc.value)


def test_production_rejects_empty_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """빈 문자열로 지워둔 경우도 미설정으로 본다."""
    _use_production(monkeypatch, JWT_SECRET="")

    with pytest.raises(ValidationError) as exc:
        Settings()

    assert "JWT_SECRET" in str(exc.value)


def test_error_lists_every_missing_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """여러 개가 비어 있으면 한 번에 모아서 알려준다(하나씩 배포 실패 반복 방지)."""
    _use_production(monkeypatch, JWT_SECRET="", ADMIN_PASSWORD="")

    with pytest.raises(ValidationError) as exc:
        Settings()

    message = str(exc.value)
    assert "JWT_SECRET" in message
    assert "ADMIN_PASSWORD" in message


@pytest.mark.parametrize("env", ["local", "staging"])
def test_non_production_allows_defaults(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    """개발 편의 — 운영이 아니면 기본값 그대로 뜬다."""
    monkeypatch.setenv("APP_ENV", env)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    settings = Settings()

    assert settings.app_env == env


def test_production_rejects_frontend_origin_without_scheme(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """스킴이 없으면 QR을 조립해도 링크가 아니라 문자열이 되어 기본 카메라 앱 폴백이 깨진다."""
    _use_production(monkeypatch, FRONTEND_ORIGIN="i-be.vercel.app")

    with pytest.raises(ValidationError) as exc:
        Settings()

    assert "FRONTEND_ORIGIN" in str(exc.value)
