"""백그라운드 카드 생성 워커.

- ops.jobs 폴링 (1초 간격, FOR UPDATE SKIP LOCKED)
- asyncio.Semaphore로 동시성 제한
- fire-and-forget으로 각 잡을 백그라운드 코루틴에 위임
- 시작 시 stuck job 회수

Service/Repository는 실제 구현 시 의존성 주입으로 받는다.
"""

from __future__ import annotations

import asyncio

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def card_worker_loop() -> None:
    settings = get_settings()
    sem = asyncio.Semaphore(settings.card_worker_concurrency)
    poll_interval = settings.job_poll_interval_seconds

    # 시작 시 stuck job 회수 (구현 시 JobRepo.recover_stuck 호출)
    logger.info(
        "card_worker.loop.start",
        concurrency=settings.card_worker_concurrency,
        poll_interval=poll_interval,
    )

    try:
        while True:
            try:
                job = await _claim_next_job()
                if job is None:
                    await asyncio.sleep(poll_interval)
                    continue

                asyncio.create_task(_handle_job(job, sem))  # noqa: RUF006
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("card_worker.loop.error")
                await asyncio.sleep(poll_interval)
    except asyncio.CancelledError:
        logger.info("card_worker.loop.cancelled")
        raise


async def _claim_next_job() -> object | None:
    """JobRepository.claim_next 호출 자리. 미구현."""
    return None


async def _handle_job(job: object, sem: asyncio.Semaphore) -> None:
    """잡 1건 처리. CardService.run_generation 호출 자리."""
    async with sem:
        try:
            # CardService.run_generation(job)
            raise NotImplementedError
        except Exception:
            logger.exception("card_worker.job.failed", job=str(job))
