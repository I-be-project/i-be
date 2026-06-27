"""S3 스토리지 어댑터.

단일 비공개 버킷에 3개 프리픽스(uploads/ai-images/cards)로 저장하고,
외부 노출은 Presigned GET URL로만 한다. 바이너리는 S3에, DB엔 키만 보관.
업로드는 항상 SSE(AES256) + ContentType 지정. delete는 명시적 삭제 요청 전용.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, cast

import aioboto3

from app.config import Settings

# 호출마다 S3 클라이언트(async context manager)를 새로 만드는 팩토리.
# 테스트에서 가짜 클라이언트를 주입하기 위한 seam.
S3ClientFactory = Callable[[], AbstractAsyncContextManager[Any]]


class StorageClient:
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        prefix_uploads: str,
        prefix_ai_images: str,
        prefix_cards: str,
        client_factory: S3ClientFactory | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._prefix_uploads = prefix_uploads
        self._prefix_ai_images = prefix_ai_images
        self._prefix_cards = prefix_cards
        self._client_factory = client_factory or self._default_client

    @classmethod
    def from_settings(cls, settings: Settings) -> StorageClient:
        return cls(
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            access_key_id=settings.aws_access_key_id,
            secret_access_key=settings.aws_secret_access_key,
            prefix_uploads=settings.storage_prefix_uploads,
            prefix_ai_images=settings.storage_prefix_ai_images,
            prefix_cards=settings.storage_prefix_cards,
        )

    def _default_client(self) -> AbstractAsyncContextManager[Any]:
        session = aioboto3.Session(
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            region_name=self._region,
        )
        return cast(AbstractAsyncContextManager[Any], session.client("s3"))

    async def _put(self, key: str, data: bytes, *, content_type: str) -> str:
        async with self._client_factory() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        return key

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str:
        """학생 원본 사진 업로드(uploads/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_uploads}/{path}", data, content_type=content_type)

    async def upload_generated_image(self, path: str, data: bytes, *, content_type: str) -> str:
        """AI 생성 인물 이미지 업로드(ai-images/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_ai_images}/{path}", data, content_type=content_type)

    async def upload_card_image(self, path: str, data: bytes, *, content_type: str) -> str:
        """최종 카드 이미지 업로드(cards/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_cards}/{path}", data, content_type=content_type)

    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        """key에 대한 Presigned GET URL 발급."""
        async with self._client_factory() as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=ttl_seconds,
            )
        return cast(str, url)

    async def delete(self, key: str) -> None:
        """객체 삭제. 명시적 삭제 요청 전용(자동 폐기 아님)."""
        async with self._client_factory() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=key)
