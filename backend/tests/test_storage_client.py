"""S3 StorageClient 단위 테스트 (가짜 S3 클라이언트, 실제 AWS 호출 없음)."""

from __future__ import annotations

from app.adapters.storage_client import StorageClient


class _FakeS3:
    """aioboto3 s3 client를 흉내내는 async context manager."""

    def __init__(self) -> None:
        self.put_calls: list[dict] = []
        self.delete_calls: list[dict] = []
        self.sign_calls: list[tuple[str, dict]] = []

    async def __aenter__(self) -> _FakeS3:
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    async def put_object(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)

    async def delete_object(self, **kwargs: object) -> None:
        self.delete_calls.append(kwargs)

    async def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        self.sign_calls.append((operation, kwargs))
        return "https://signed.example/get"


def _make(fake: _FakeS3) -> StorageClient:
    return StorageClient(
        bucket="test-bucket",
        region="ap-northeast-2",
        access_key_id="AKIATEST",
        secret_access_key="secretvalue",
        prefix_uploads="uploads",
        prefix_ai_images="ai-images",
        prefix_cards="cards",
        client_factory=lambda: fake,
    )


async def test_upload_photo_uses_uploads_prefix_and_returns_key():
    fake = _FakeS3()
    client = _make(fake)

    key = await client.upload_photo("stud-1/a.jpg", b"bytes", content_type="image/jpeg")

    assert key == "uploads/stud-1/a.jpg"
    assert fake.put_calls[0]["Bucket"] == "test-bucket"
    assert fake.put_calls[0]["Key"] == "uploads/stud-1/a.jpg"
    assert fake.put_calls[0]["Body"] == b"bytes"
    assert fake.put_calls[0]["ContentType"] == "image/jpeg"
    assert fake.put_calls[0]["ServerSideEncryption"] == "AES256"


async def test_upload_generated_image_uses_ai_images_prefix():
    fake = _FakeS3()
    key = await _make(fake).upload_generated_image("card-1/p.png", b"x", content_type="image/png")
    assert key == "ai-images/card-1/p.png"
    assert fake.put_calls[0]["Key"] == "ai-images/card-1/p.png"


async def test_upload_card_image_uses_cards_prefix():
    fake = _FakeS3()
    key = await _make(fake).upload_card_image("card-1/c.png", b"x", content_type="image/png")
    assert key == "cards/card-1/c.png"
    assert fake.put_calls[0]["Key"] == "cards/card-1/c.png"


async def test_create_signed_url_passes_key_and_ttl():
    fake = _FakeS3()
    url = await _make(fake).create_signed_url("cards/card-1/c.png", ttl_seconds=3600)
    assert url == "https://signed.example/get"
    op, kwargs = fake.sign_calls[0]
    assert op == "get_object"
    assert kwargs["Params"] == {"Bucket": "test-bucket", "Key": "cards/card-1/c.png"}
    assert kwargs["ExpiresIn"] == 3600


async def test_delete_calls_delete_object_with_key():
    fake = _FakeS3()
    await _make(fake).delete("uploads/stud-1/a.jpg")
    assert fake.delete_calls[0] == {"Bucket": "test-bucket", "Key": "uploads/stud-1/a.jpg"}
