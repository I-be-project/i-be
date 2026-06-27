"""Settings의 S3 필드가 환경변수에서 로드되는지 검증."""

from __future__ import annotations

from app.config import Settings


def test_settings_loads_s3_fields(monkeypatch):
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setenv("S3_REGION", "ap-northeast-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIATEST")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secretvalue")

    s = Settings()

    assert s.s3_bucket == "my-bucket"
    assert s.s3_region == "ap-northeast-2"
    assert s.aws_access_key_id == "AKIATEST"
    assert s.aws_secret_access_key == "secretvalue"
    # 프리픽스 기본값
    assert s.storage_prefix_uploads == "uploads"
    assert s.storage_prefix_ai_images == "ai-images"
    assert s.storage_prefix_cards == "cards"
