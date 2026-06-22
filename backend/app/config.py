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
    database_enabled: bool = True
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
    jwt_issuer: str = "ibe"
    student_token_ttl_hours: int = 6
    operator_token_ttl_hours: int = 12
    share_link_ttl_hours: int = 24

    # AI — OpenRouter 키 하나로 chat·image 통합.
    ai_api_key: str = ""

    # AI — Chat 계열 (OpenAI 호환: OpenRouter)
    ai_chat_base_url: str = "https://openrouter.ai/api/v1"
    ai_model_analyze: str = "openai/gpt-5-mini"
    ai_model_adaptive_questions: str = "openai/gpt-5-mini"
    ai_model_final_question: str = "openai/gpt-5.2"
    ai_model_persona: str = "openai/gpt-5.2"
    ai_model_image_prompt: str = "openai/gpt-5-mini"

    # AI — 이미지 생성·편집 (OpenRouter)
    # OpenRouter는 /chat/completions 한 엔드포인트로 생성·편집을 처리(modalities + image_config).
    # 응답: choices[0].message.images[0].image_url.url (data URI). httpx 직접 호출.
    ai_image_api_url: str = "https://openrouter.ai/api/v1/chat/completions"
    ai_image_model: str = "google/gemini-3.1-flash-image-preview"
    # size는 aspect_ratio 변환용 기본값 (예: 1024x1536 → 2:3). 파이프라인이 보통 명시 전달.
    ai_image_size: str = "1024x1024"
    # 출력 해상도 image_config.image_size: "" (모델 기본) | "0.5K" | "1K" | "2K" | "4K".
    # 확실 지원: google/gemini-3.1-flash-image-preview. 2.5-flash-image는 ~1K 고정(무시될 수 있음).
    ai_image_quality: str = "2K"
    # 얼굴 입력(image-to-image) 보존 강도: 낮을수록 원본에 가까움 (0.0~1.0).
    ai_image_strength: float = 0.5
    ai_image_timeout_seconds: float = 60.0
    image_concurrency: int = 10
    # 일시적 실패(타임아웃·429·5xx·손상응답) 재시도. 총 시도 = max_retries + 1.
    ai_image_max_retries: int = 2
    ai_image_retry_base_delay: float = 0.5  # 지수 백오프 기준(초): 0.5, 1.0, 2.0 …

    # Worker
    card_worker_enabled: bool = True
    card_worker_concurrency: int = 10
    job_poll_interval_seconds: float = 1.0
    job_max_retries: int = 2
    job_stuck_timeout_minutes: int = 10


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
