"""카드 자동 공개 — 설문·사진을 마친 학생을 폴링해 API로 카드를 만들어 바로 공개한다.

대기열은 DB 상태 그 자체다(DraftRepository.list_publish_targets):
AUTO_CARD_SINCE 이후 설문 완료 + 사진 있음 + 초안 없음. 별도 잡 테이블이 없어 재시작해도
그대로 이어지고, 초안이 세션당 하나라 공개는 한 번뿐이다(공개 뒤 사진을 바꿔도 다시 만들지 않는다).

공개 규칙(검수 없음):
- 페르소나 + 사진이 다 나오면 → 초안 저장 → 승인(카드 공개).
- 사진이 '거절'(얼굴 없음 등)이면 → 폴백 캐릭터 카드로 공개. 다시 해도 같다.
- 429·5xx·이미지 없는 응답 같은 일시적 실패는 저장하지 않는다 — 다음 폴링에 다시 시도한다.
  AUTO_CARD_MAX_ATTEMPTS번 넘게 실패하면 승인하지 않은 초안으로 남겨 대상에서 빼고,
  검수 화면(/dev/review)의 실패 목록에서 다시 만든다.

2026-10-11 첫 가동에서 일시적 실패를 폴백 카드로 공개해 학생 6명이 잘못 공개됐다 — 위 규칙의 이유.
로컬 .env도 운영 DB를 가리키므로 기본은 꺼져 있다(AUTO_CARD_ENABLED). 서버 한 곳에서만 켠다.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime
from uuid import UUID

from app.adapters.ai_client import AIClient
from app.adapters.codex_client import CodexClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.adapters.vertex_image_client import VertexImageClient
from app.config import Settings
from app.core.logging import get_logger
from app.repositories.draft_repo import DraftRepository, DraftTarget
from app.repositories.onsite_photo_repo import OnsitePhotoRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.student_repo import StudentRepository
from app.services.api_draft_service import ApiDraftService
from app.services.draft_service import DraftService

logger = get_logger(__name__)


class CardPublisher:
    def __init__(
        self,
        *,
        service: ApiDraftService,
        drafts: DraftRepository,
        students: StudentRepository,
        since: datetime,
        concurrency: int,
        max_attempts: int,
        retry_seconds: float = 30,
    ) -> None:
        self._service = service
        self._drafts = drafts
        self._students = students
        self._since = since
        self._concurrency = concurrency
        self._max_attempts = max_attempts
        self._retry_seconds = retry_seconds
        self._retry_after: dict[UUID, float] = {}
        # ponytail: 실패 횟수는 메모리에만 — 재시작하면 0부터 다시 센다. 상한에 닿으면
        # 초안을 남겨 대상에서 빠지므로 재시작으로 무한 반복되지는 않는다(페르소나 실패만 예외).
        self._attempts: dict[UUID, int] = {}

    async def run_once(self) -> int:
        """대상을 한 묶음 처리한다. 저장한 초안 수(진행이 없으면 0을 반환해 쉰다)."""
        now = time.monotonic()
        self._retry_after = {key: due for key, due in self._retry_after.items() if due > now}
        excluded = set(self._retry_after) | {
            key for key, attempts in self._attempts.items() if attempts >= self._max_attempts
        }
        targets = [
            t
            for t in await self._drafts.list_publish_targets(
                since=self._since, limit=200, exclude_session_ids=list(excluded)
            )
            if t.session_id not in excluded
        ][: self._concurrency]
        results = await asyncio.gather(*(self._publish_logged(t) for t in targets))
        return sum(results)

    async def _publish_logged(self, target: DraftTarget) -> bool:
        try:
            if await self.publish(target) is not None:
                self._retry_after.pop(target.session_id, None)
                return True
        except Exception:
            # 저장 단계(S3·DB) 오류 등 — 일시적 실패와 같이 세고 다음 폴링에 다시 시도한다.
            self._attempts[target.session_id] = self._attempts.get(target.session_id, 0) + 1
            logger.exception("card_publisher.failed", student_id=str(target.student_id))
        self._retry_after[target.session_id] = time.monotonic() + self._retry_seconds
        return False

    async def publish(self, target: DraftTarget) -> UUID | None:
        """대상 1명 생성 → 공개 판단. 저장한 초안 id, 저장하지 않았으면 None."""
        student = await self._students.get_by_id(target.student_id)
        if student is None or not student.photo_key:
            return None
        resumed = await self._service.resume_publication(target)
        if resumed is not None:
            return resumed
        if await self._service.waiting_for_onsite_photo(student):
            return None
        result = await self._service.generate(student, target.session_id)
        if result.publishable:
            draft_id = await self._service.save(target, result, approve=True)
            logger.info(
                "card_publisher.published",
                student_id=str(target.student_id),
                draft_id=str(draft_id),
                fallback=result.image is None,
            )
            return draft_id

        if result.image_quota and result.text is not None:
            # 할당량에 밀린 건 횟수에 세지 않는다 — 몇 분 밀렸다고 보류로 빠지면 사람이 풀어야 한다.
            logger.warning("card_publisher.quota_wait", student_id=str(target.student_id))
            return None
        n = self._attempts[target.session_id] = self._attempts.get(target.session_id, 0) + 1
        logger.warning(
            "card_publisher.retry",
            student_id=str(target.student_id),
            attempt=n,
            persona_error=result.persona_error,
            image_error=result.image_error,
        )
        if n < self._max_attempts:
            return None
        if result.text is None:
            logger.error("card_publisher.gave_up", student_id=str(target.student_id))
            return None
        # 페르소나는 있는데 사진이 끝내 안 나왔다 — 공개하지 않고 초안으로만 남긴다.
        draft_id = await self._service.save(target, result, approve=False)
        logger.error(
            "card_publisher.held", student_id=str(target.student_id), draft_id=str(draft_id)
        )
        return draft_id


async def card_publisher_loop(publisher: CardPublisher, poll_seconds: float) -> None:
    logger.info("card_publisher.loop.start", poll_seconds=poll_seconds)
    while True:
        try:
            if await publisher.run_once():
                continue  # 밀린 대상이 있으면 쉬지 않고 다음 묶음
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("card_publisher.loop.error")
        await asyncio.sleep(poll_seconds)


def build_card_publisher(
    settings: Settings, pool: DBPool, ai: AIClient, storage: StorageClient
) -> CardPublisher:
    drafts = DraftRepository(pool)
    students = StudentRepository(pool)
    service = ApiDraftService(
        ai=ai,
        vertex=VertexImageClient.from_settings(settings),
        draft_service=DraftService(
            # DraftService는 codex 초안 경로도 품고 있지만 여기선 프롬프트·승인만 쓴다.
            codex=CodexClient(
                binary=settings.codex_bin, timeout_seconds=settings.codex_timeout_seconds
            ),
            storage=storage,
            sessions=SessionRepository(pool),
            drafts=drafts,
            students=students,
            qr_origin=settings.card_qr_origin,
        ),
        drafts=drafts,
        storage=storage,
        persona_model=settings.api_persona_model,
        onsite_photos=OnsitePhotoRepository(storage, students),
    )
    return CardPublisher(
        service=service,
        drafts=drafts,
        students=students,
        since=settings.auto_card_since,
        concurrency=settings.auto_card_concurrency,
        max_attempts=settings.auto_card_max_attempts,
    )
