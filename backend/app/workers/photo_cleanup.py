"""DB에서 더 이상 참조하지 않는 교체 사진만 정리한다."""

import asyncio

from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.core.logging import get_logger
from app.repositories.student_repo import StudentRepository

logger = get_logger(__name__)


async def cleanup_once(repo: StudentRepository, storage: StorageClient) -> None:
    for key in await repo.unused_photo_keys():
        try:
            await storage.delete(key)
            await repo.finish_photo_cleanup(key)
        except Exception:
            logger.exception("photo_cleanup.retry")


async def photo_cleanup_loop(pool: DBPool, storage: StorageClient) -> None:
    repo = StudentRepository(pool)
    while True:
        try:
            await cleanup_once(repo, storage)
        except Exception:
            logger.exception("photo_cleanup.failed")
        await asyncio.sleep(60)
