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
        # 리전 엔드포인트를 명시. 생략하면 글로벌(s3.amazonaws.com)로 서명돼
        # ap-northeast-2 같은 비-us-east-1 버킷의 Presigned URL이 403이 난다.
        return cast(
            AbstractAsyncContextManager[Any],
            session.client("s3", endpoint_url=f"https://s3.{self._region}.amazonaws.com"),
        )

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

    async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
        """여러 key를 클라이언트 하나로 서명해 {key: url}로 돌려준다.

        호출마다 클라이언트를 새로 만들면 건당 40~50 ms가 드는데, 서명 연산 자체는
        네트워크 없는 로컬 계산이라 0.3 ms다. 클라이언트를 한 번만 만들어 전 건을
        서명하면 703건 기준 31초 → 0.18초가 된다.
        개별 key의 서명 실패는 그 key만 결과에서 빼고 넘어간다(단건 create_signed_url의
        graceful 동작과 동일).
        """
        if not keys:
            return {}
        urls: dict[str, str] = {}
        async with self._client_factory() as s3:
            for key in dict.fromkeys(keys):  # 중복 key는 한 번만 서명
                try:
                    urls[key] = cast(
                        str,
                        await s3.generate_presigned_url(
                            "get_object",
                            Params={"Bucket": self._bucket, "Key": key},
                            ExpiresIn=ttl_seconds,
                        ),
                    )
                except Exception:
                    continue
        return urls

    async def delete(self, key: str) -> None:
        """객체 삭제. 명시적 삭제 요청 전용(자동 폐기 아님)."""
        async with self._client_factory() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=key)
