"""환경변수 기반 애플리케이션 설정.

- pydantic-settings로 검증
- .env 파일 자동 로드
- 운영/스테이징/로컬은 APP_ENV로 분기
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: Literal["local", "staging", "production"] = "local"
    app_base_url: str = "http://localhost:8000"
    frontend_origin: str = "http://localhost:3000"
    log_level: str = "INFO"

    # DB
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/postgres",
        description="asyncpg 호환 Postgres DSN",
    )

    # Storage (Supabase)
    supabase_url: str = ""
    supabase_service_key: str = ""
    storage_bucket_photos: str = "photos"
    storage_bucket_cards: str = "cards"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_card_share_secret: str = "change-me-share"
    jwt_issuer: str = "nabe"
    student_token_ttl_hours: int = 6
    operator_token_ttl_hours: int = 12
    share_link_ttl_hours: int = 24

    # AI
    ai_provider_base_url: str = "https://openrouter.ai/api/v1"
    ai_api_key: str = ""
    ai_model_analyze: str = "openai/gpt-5-mini"
    ai_model_adaptive_questions: str = "openai/gpt-5-mini"
    ai_model_final_question: str = "openai/gpt-5.2"
    ai_model_persona: str = "openai/gpt-5.2"
    ai_model_image_prompt: str = "openai/gpt-5-mini"
    ai_model_portrait_image: str = "openai/gpt-image-1.5"
    ai_model_world_image: str = "openai/gpt-image-1.5"
    image_concurrency: int = 10

    # Worker
    card_worker_enabled: bool = True
    card_worker_concurrency: int = 10
    job_poll_interval_seconds: float = 1.0
    job_max_retries: int = 2
    job_stuck_timeout_minutes: int = 10


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
