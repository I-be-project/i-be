"""Supabase Storage 어댑터.

- private/cards 버킷에 업로드, Signed URL 발급
- 구현은 supabase-py 또는 HTTP API 직접 호출 중 선택 (TBD)
"""

from __future__ import annotations

from app.config import Settings


class StorageClient:
    def __init__(
        self,
        *,
        url: str,
        service_key: str,
        bucket_photos: str,
        bucket_cards: str,
    ) -> None:
        self._url = url
        self._service_key = service_key
        self._bucket_photos = bucket_photos
        self._bucket_cards = bucket_cards

    @classmethod
    def from_settings(cls, settings: Settings) -> StorageClient:
        return cls(
            url=settings.supabase_url,
            service_key=settings.supabase_service_key,
            bucket_photos=settings.storage_bucket_photos,
            bucket_cards=settings.storage_bucket_cards,
        )

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str:
        """학생 사진 업로드. Storage 경로 반환."""
        raise NotImplementedError

    async def upload_card_image(self, path: str, data: bytes, *, content_type: str) -> str:
        """카드 생성 이미지 업로드. Storage 경로 반환."""
        raise NotImplementedError

    async def create_signed_url(self, bucket: str, path: str, *, ttl_seconds: int) -> str:
        """signed URL 발급."""
        raise NotImplementedError

    async def delete(self, bucket: str, path: str) -> None:
        raise NotImplementedError
