"""초안 일괄 생성 실행기 — 스크립트(scripts/batch_drafts.py)와 검수 화면이 같이 쓴다.

검수 화면에서 시작한 작업은 백엔드 프로세스 안의 백그라운드 태스크로 돈다.
진행 상태는 메모리에만 있다 — 서버가 재시작되면(--reload 포함) 작업이 끊기지만,
초안이 있는 세션은 대상에서 빠지므로 같은 조건으로 다시 시작하면 이어서 한다.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.core.errors import ConflictError
from app.repositories.draft_repo import DraftTarget
from app.services.draft_service import DraftService

# (대상, 결과 문구, 걸린 초) — 스크립트가 한 줄씩 출력하는 데 쓴다.
OnItem = Callable[[DraftTarget, str, float], None]


@dataclass
class BatchProgress:
    label: str = ""
    total: int = 0
    done: int = 0
    failed: int = 0
    running: bool = False
    cancelled: bool = False
    started_at: datetime | None = None
    finished_at: datetime | None = None
    errors: list[str] = field(default_factory=list)


class DraftBatch:
    def __init__(self) -> None:
        self.progress = BatchProgress()
        self._task: asyncio.Task[BatchProgress] | None = None

    async def run(
        self,
        service: DraftService,
        targets: list[DraftTarget],
        *,
        concurrency: int,
        label: str = "",
        on_item: OnItem | None = None,
    ) -> BatchProgress:
        """대상 전원에 [텍스트 → 이미지]. 한 명의 실패로 전체를 멈추지 않는다.

        텍스트 실패는 초안이 안 생겨 다음 실행에서 다시 대상이 된다.
        이미지 실패는 service가 초안의 error에 남기고 삼킨다(카드는 폴백).
        """
        self._reset(label, len(targets))
        return await self._run(service, targets, concurrency=concurrency, on_item=on_item)

    def _reset(self, label: str, total: int) -> None:
        self.progress = BatchProgress(
            label=label, total=total, running=True, started_at=datetime.now(UTC)
        )

    async def _run(
        self,
        service: DraftService,
        targets: list[DraftTarget],
        *,
        concurrency: int,
        on_item: OnItem | None,
    ) -> BatchProgress:
        sem = asyncio.Semaphore(concurrency)

        async def one(target: DraftTarget) -> None:
            async with sem:
                t0 = time.monotonic()
                try:
                    draft_id = await service.generate_text(target.session_id, target.student_id)
                    await service.generate_image(draft_id)
                    status = "ok"
                except Exception as exc:
                    self.progress.failed += 1
                    status = f"실패: {exc}"
                    self.progress.errors = [
                        *self.progress.errors[-9:],
                        f"{target.student_id}: {exc}",
                    ]
                self.progress.done += 1
                if on_item:
                    on_item(target, status, time.monotonic() - t0)

        try:
            await asyncio.gather(*(one(t) for t in targets))
        except asyncio.CancelledError:
            self.progress.cancelled = True
            raise
        finally:
            self.progress.running = False
            self.progress.finished_at = datetime.now(UTC)
        return self.progress

    def start(
        self,
        service: DraftService,
        targets: list[DraftTarget],
        *,
        concurrency: int,
        label: str,
    ) -> None:
        """백그라운드로 시작. codex 사용량 때문에 동시에 한 작업만 허용한다."""
        if self._task is not None and not self._task.done():
            raise ConflictError("이미 일괄 생성이 진행 중입니다.")
        # 태스크가 첫 스케줄을 받기 전에 응답이 나가므로 상태는 여기서 먼저 채운다.
        self._reset(label, len(targets))
        self._task = asyncio.create_task(
            self._run(service, targets, concurrency=concurrency, on_item=None)
        )

    def cancel(self) -> None:
        """진행 중인 codex 호출까지 끊는다. 이미 저장된 초안은 남는다."""
        if self._task is not None and not self._task.done():
            self._task.cancel()


# 검수 화면용 프로세스 단일 인스턴스.
dev_batch = DraftBatch()
