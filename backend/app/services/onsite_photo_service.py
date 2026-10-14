"""현장 참여자의 사진 등록 직후 생성하고, 카드 합성과 별개로 사진을 공개한다."""

from __future__ import annotations

from uuid import UUID

from app.adapters.storage_client import StorageClient
from app.adapters.vertex_image_client import ImageRefusedError, VertexImageClient
from app.core.errors import ConflictError, DomainError, NotFoundError
from app.core.logging import get_logger
from app.core.prompts.future_photo_prompt import DEFAULT_FUTURE_PHOTO_PROMPT
from app.repositories.draft_repo import DraftRepository
from app.repositories.onsite_photo_repo import OnsitePhoto, OnsitePhotoRepository, PhotoChoice
from app.repositories.session_repo import SessionRepository
from app.repositories.student_repo import StudentRepository
from app.schemas.students import OnsitePhotoResult
from app.services.api_draft_service import vertex_future_photo
from app.services.draft_service import DraftService

logger = get_logger(__name__)


class OnsitePhotoService:
    def __init__(
        self,
        *,
        photos: OnsitePhotoRepository,
        students: StudentRepository,
        sessions: SessionRepository,
        drafts: DraftRepository,
        draft_service: DraftService,
        storage: StorageClient,
        vertex: VertexImageClient,
    ) -> None:
        self.photos, self.students, self.sessions = photos, students, sessions
        self.drafts, self.draft_service = drafts, draft_service
        self.storage, self.vertex = storage, vertex

    async def start(self, student_id: UUID) -> OnsitePhoto | None:
        student = await self.students.get_by_id(student_id)
        if not student or not student.photo_key:
            raise DomainError("먼저 사진을 등록해 주세요.")
        return await self.photos.claim(student_id, student.photo_key)

    async def generate(self, job: OnsitePhoto) -> None:
        try:
            source = await self.storage.download(job.photo_key)
            result = await vertex_future_photo(self.vertex, source, DEFAULT_FUTURE_PHOTO_PROMPT)
            key = await self.storage.upload_generated_image(
                f"{job.student_id}/onsite-{job.id}.png", result.data, content_type="image/png"
            )
            await self.photos.finish(job, "ready", key)
        except ImageRefusedError:
            await self.photos.finish(job, "refused", None)
        except Exception:
            logger.exception("onsite_photo.failed", job_id=str(job.id))
            await self.photos.finish(job, "failed", None)

    async def result(self, student_id: UUID) -> OnsitePhotoResult:
        photo = await self.photos.get_current(student_id)
        if not photo:
            return OnsitePhotoResult(status="pending")
        url = (
            await self.storage.create_signed_url(photo.image_key, ttl_seconds=3600)
            if photo.image_key
            else None
        )
        return OnsitePhotoResult(status=photo.status, image_url=url, choice=photo.choice)

    async def choose(self, student_id: UUID, choice: PhotoChoice) -> OnsitePhotoResult:
        session = await self.sessions.get_latest_completed_for_student(student_id)
        if not session:
            raise DomainError("설문을 먼저 완료해 주세요.")
        photo = await self.photos.get_current(student_id)
        if not photo:
            raise NotFoundError("등록된 현장 사진이 없습니다.")
        if not await self.photos.choose(photo, choice):
            raise ConflictError("이미 사진을 골랐거나 아직 이미지가 준비되지 않았습니다.")
        # 카드가 먼저 완성된 경우에도 선택을 반영한다. 카드가 나중에 완성되면 publisher가 반영한다.
        draft = await self.drafts.get_by_session(session.id)
        if draft and draft.status == "approved" and draft.image_key:
            try:
                await self.draft_service.choose_card_photo(student_id, use_ai=choice == "ai")
            except ConflictError:
                # 같은 선택의 재전송과 publisher 동시 처리는 멱등 성공으로 처리한다.
                if not await self.drafts.persona_photo_chosen(session.id):
                    raise
        return await self.result(student_id)
