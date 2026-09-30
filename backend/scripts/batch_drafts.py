"""페르소나·카드 초안 일괄 생성 — 로컬 codex 전용.

학생별 최근 완료 세션 중 초안이 없는 것을 골라 [페르소나 텍스트 → 인물 이미지]를
만들고 generated.persona_drafts에 검수 대기(pending)로 쌓는다. 이미지는 S3 ai-images/.
검수·승인은 /dev/review 화면에서 한다.

backend/.env의 DATABASE_URL·S3 설정을 그대로 쓴다 — 로컬에서 돌려도 운영 DB·버킷에 쓴다.

Usage:
  uv run python -m scripts.batch_drafts --limit 10
  uv run python -m scripts.batch_drafts --limit 5000 --concurrency 2
  uv run python -m scripts.batch_drafts --student-id <uuid>
  uv run python -m scripts.batch_drafts --school 대전관저중학교 --grade 2 --class-no 3 --limit 100

검수 화면(/dev/review)에서도 학교·학년·반을 골라 같은 작업을 시작할 수 있다.

이어하기: 초안이 이미 있는 세션은 건너뛰므로 중단 후 같은 명령을 다시 돌리면 된다.
텍스트 생성이 실패한 학생은 초안이 안 생겨 다음 실행에서 다시 시도된다.
이미지만 실패한 학생은 초안에 error가 남는다 — 검수 화면에서 이미지만 재생성한다.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from uuid import UUID

from app.adapters.codex_client import CodexClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.config import get_settings
from app.repositories.draft_repo import DraftRepository, DraftTarget
from app.repositories.session_repo import SessionRepository
from app.services.draft_batch import DraftBatch
from app.services.draft_service import DraftService


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    pool = DBPool(settings.database_url)
    await pool.connect(max_size=args.concurrency + 2)
    drafts = DraftRepository(pool)
    service = DraftService(
        codex=CodexClient(
            binary=settings.codex_bin, timeout_seconds=settings.codex_timeout_seconds
        ),
        storage=StorageClient.from_settings(settings),
        sessions=SessionRepository(pool),
        drafts=drafts,
        frontend_origin=settings.frontend_origin,
    )
    try:
        targets = await drafts.list_targets(
            limit=args.limit,
            student_id=args.student_id,
            school=args.school,
            grade=args.grade,
            class_no=args.class_no,
        )
        total = len(targets)
        print(f"대상 {total}명 · 동시 {args.concurrency}")
        if not total:
            return 0

        def on_item(target: DraftTarget, status: str, seconds: float) -> None:
            p = batch.progress
            eta = (time.monotonic() - started) / p.done * (total - p.done) / 60
            print(
                f"[{p.done}/{total}] {target.student_id} {seconds:.0f}s {status} "
                f"· 남은 약 {eta:.0f}분",
                flush=True,
            )

        batch = DraftBatch()
        started = time.monotonic()
        result = await batch.run(service, targets, concurrency=args.concurrency, on_item=on_item)
        print(f"완료 {result.done - result.failed} · 텍스트 실패 {result.failed}")
        return 1 if result.failed else 0
    finally:
        await pool.disconnect()


def main() -> int:
    parser = argparse.ArgumentParser(description="페르소나·카드 초안 일괄 생성 (로컬 codex)")
    # 기본을 작게 둔다 — 실수로 전원을 돌리면 수십 시간·codex 사용량이 한꺼번에 나간다.
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--student-id", type=UUID, default=None)
    parser.add_argument("--school", default=None)
    parser.add_argument("--grade", type=int, default=None)
    parser.add_argument("--class-no", type=int, default=None)
    args = parser.parse_args()
    if args.concurrency < 1:
        print("--concurrency는 1 이상", file=sys.stderr)
        return 2
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
