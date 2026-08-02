"""환경변수 기반 애플리케이션 설정.

- pydantic-settings로 검증
- .env 파일 자동 로드
- 운영/스테이징/로컬은 APP_ENV로 분기
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# APP_ENV=production에서 반드시 .env로 채워야 하는 설정 (필드명 → 환경변수명).
# 기본값을 그대로 두면 기동을 실패시킨다.
_PRODUCTION_REQUIRED_SETTINGS = {
    "jwt_secret": "JWT_SECRET",
    "jwt_card_share_secret": "JWT_CARD_SHARE_SECRET",
    "admin_password": "ADMIN_PASSWORD",
    "frontend_origin": "FRONTEND_ORIGIN",
}


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
    # 프론트 오리진 — 부스 QR 링크(/b/<code>)의 base. 운영에서는 반드시 .env로 채운다.
    frontend_origin: str = "http://localhost:3000"
    log_level: str = "INFO"

    # CORS 허용 오리진 — 기본 "*"는 전 오리진 개방(외부 시스템의 직접 호출 허용).
    # 좁히려면 콤마로 나열: "https://나be한마당.kr,https://admin.example.com"
    cors_allow_origins: str = "*"

    # DB
    database_enabled: bool = True
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/postgres",
        description="asyncpg 호환 Postgres DSN",
    )

    # Supabase (DB·Auth 맥락에서만 사용; 스토리지는 S3로 이전)
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Storage (S3 단일 비공개 버킷 + 프리픽스)
    s3_region: str = "ap-northeast-2"
    s3_bucket: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    storage_prefix_uploads: str = "uploads"
    storage_prefix_ai_images: str = "ai-images"
    storage_prefix_cards: str = "cards"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_card_share_secret: str = "change-me-share"
    jwt_issuer: str = "ibe"
    student_token_ttl_hours: int = 12
    operator_token_ttl_hours: int = 12
    share_link_ttl_hours: int = 24

    # 관리자(단일 계정) — 운영 배포 시 .env로 주입.
    admin_username: str = "admin"
    admin_password: str = "change-me-admin"
    admin_token_ttl_hours: int = 12

    # AI — OpenRouter 키 하나로 chat·image 통합.
    openrouter_api_key: str = ""

    # AI — Chat 계열 (OpenAI 호환: OpenRouter)
    ai_chat_base_url: str = "https://openrouter.ai/api/v1"
    # 모든 chat 단계가 기본으로 이 모델 하나를 쓴다. AI_MODEL로 한 번에 변경.
    ai_model: str = "openai/gpt-5-mini"
    # (선택) 특정 단계만 다른 모델을 쓰고 싶을 때만 채운다. 빈 값이면 ai_model로 폴백.
    ai_model_analyze: str = ""
    ai_model_adaptive_questions: str = ""
    ai_model_final_question: str = ""
    ai_model_persona: str = ""
    ai_model_image_prompt: str = ""

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

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS_ALLOW_ORIGINS(콤마 구분) → 오리진 리스트. 비어 있으면 전체 개방."""
        origins = [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]
        return origins or ["*"]

    @model_validator(mode="after")
    def _reject_placeholder_secrets(self) -> Settings:
        """APP_ENV=production인데 필수 설정이 기본값·빈 값이면 기동을 실패시킨다.

        조용히 뜨면 공개된 플레이스홀더로 학생·관리자 토큰을 서명하게 되므로,
        배포를 실패시켜 헬스체크에서 잡히게 하는 편이 안전하다.
        FRONTEND_ORIGIN도 같은 이유다 — 부스 QR 링크의 base라, localhost가 박힌 인쇄물이
        현장에 나가면 되돌릴 수 없다.
        local/staging에서는 개발 편의를 위해 기본값을 그대로 허용한다.
        """
        if self.app_env != "production":
            return self

        # 기본값은 클래스 정의에서 읽는다(기본 문자열이 바뀌어도 검사가 따라간다).
        missing = [
            env_name
            for field, env_name in _PRODUCTION_REQUIRED_SETTINGS.items()
            if getattr(self, field) in ("", type(self).model_fields[field].default)
        ]
        if missing:
            raise ValueError(
                "APP_ENV=production에서는 다음 환경변수를 반드시 설정해야 합니다: "
                + ", ".join(sorted(missing))
            )

        # 스킴이 없으면(예: "i-be.vercel.app") QR을 조립해도 링크가 아니라 문자열이 되어,
        # 기본 카메라 앱이 눌러도 반응하지 않는다 — URL로 인코딩하는 목적 자체가 깨진다.
        if not self.frontend_origin.startswith(("http://", "https://")):
            raise ValueError(
                "APP_ENV=production에서 FRONTEND_ORIGIN은 http:// 또는 https://로 "
                "시작하는 절대 URL이어야 합니다."
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
