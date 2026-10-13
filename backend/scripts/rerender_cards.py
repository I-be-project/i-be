"""승인된 카드 일괄 재합성 — 배치 상수(app/services/id_card_renderer.py)를 바꾼 뒤 돌린다.

승인 초안마다 카드를 다시 그려 같은 S3 키(cards/<student_id>/<draft_id>.png)에 덮어쓴다.
AI 이미지는 다시 만들지 않는다(저장된 image_key 재사용). DB는 건드리지 않는다.

backend/.env의 DATABASE_URL·S3 설정을 그대로 쓴다 — 로컬에서 돌려도 운영 버킷에 쓴다.
먼저 /dev/review 미리보기로 새 배치를 확인하고, --limit으로 몇 장만 돌려본 뒤 전체를 돌린다.

Usage:
  uv run python -m scripts.rerender_cards --limit 3
  uv run python -m scripts.rerender_cards --student-id <uuid>
  uv run python -m scripts.rerender_cards --concurrency 8
"""

from __future__ import annotations

import argparse
import asyncio
from uuid import UUID

from app.adapters.codex_client import CodexClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.config import get_settings
from app.repositories.draft_repo import DraftRecord, DraftRepository
from app.repositories.persona_repo import PersonaRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.student_repo import StudentRepository
from app.services.draft_service import DraftService

_PAGE = 500


async def _approved(drafts: DraftRepository) -> list[DraftRecord]:
    out: list[DraftRecord] = []
    while page := await drafts.list_drafts(status="approved", limit=_PAGE, offset=len(out)):
        out += page
    return out


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    pool = DBPool(settings.database_url)
    await pool.connect(max_size=args.concurrency + 1)
    drafts = DraftRepository(pool)
    personas = PersonaRepository(pool)
    service = DraftService(
        # 재합성엔 codex를 안 쓰지만 서비스 생성자가 요구한다.
        codex=CodexClient(
            binary=settings.codex_bin, timeout_seconds=settings.codex_timeout_seconds
        ),
        storage=StorageClient.from_settings(settings),
        sessions=SessionRepository(pool),
        drafts=drafts,
        students=StudentRepository(pool),
        qr_origin=settings.card_qr_origin,
    )
    try:
        targets = await _approved(drafts)
        if args.student_id:
            targets = [d for d in targets if d.student_id == args.student_id]
        if args.limit:
            targets = targets[: args.limit]
        total, done, failed = len(targets), 0, 0
        print(f"대상 {total}장")
        # 장당 수 초(S3 왕복) — 수천 장이라 --concurrency장씩 동시에 처리한다.
        sem = asyncio.Semaphore(args.concurrency)

        async def one(draft: DraftRecord) -> None:
            nonlocal done, failed
            async with sem:
                try:
                    # 학생이 캐릭터를 골랐으면(photo_chosen_at 있고 image_key 없음) 캐릭터로 다시 그린다.
                    persona = await personas.get_by_session(draft.session_id)
                    use_image = (
                        persona is None
                        or persona.photo_chosen_at is None
                        or persona.image_key is not None
                    )
                    key = await service.upload_card(draft, use_image=use_image)
                    done += 1
                    print(f"[{done + failed}/{total}] {key}", flush=True)
                except Exception as exc:
                    failed += 1
                    print(f"[{done + failed}/{total}] 실패 {draft.id}: {exc}", flush=True)

        await asyncio.gather(*(one(d) for d in targets))
        print(f"완료 {total - failed} · 실패 {failed}")
        return 1 if failed else 0
    finally:
        await pool.disconnect()


def main() -> int:
    parser = argparse.ArgumentParser(description="승인된 카드 일괄 재합성")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--student-id", type=UUID, default=None)
    parser.add_argument("--concurrency", type=int, default=8)
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
