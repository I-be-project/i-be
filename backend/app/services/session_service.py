"""세션 생성, 답변 저장, 프로필 요약 등 세션 관련 비즈니스 로직."""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from uuid import UUID

from app.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.repositories.card_repo import CardRecord
from app.repositories.persona_repo import PersonaRecord
from app.repositories.session_repo import AnswerRecord, SessionRecord
from app.repositories.student_repo import StudentRecord
from app.schemas.persona import Persona
from app.schemas.students import CardSummary, PersonaSummary, ProfileSummary, StudentInfo

# 행사 전역 '다시 하기' 스위치 키.
RETRY_ENABLED_KEY = "retry_enabled"


class StudentRepo(Protocol):
    async def get_by_id(self, student_id: UUID) -> StudentRecord | None: ...


class SessionRepo(Protocol):
    async def get_by_id(self, session_id: UUID) -> SessionRecord | None: ...
    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None: ...
    async def get_latest_completed_for_student(self, student_id: UUID) -> SessionRecord | None: ...
    async def create(
        self, student_id: UUID, *, status: str = ..., conn: Any = ...
    ) -> SessionRecord: ...
    async def update_status(
        self, session_id: UUID, status: str, *, conn: Any = ...
    ) -> SessionRecord: ...
    async def insert_answer(
        self,
        session_id: UUID,
        stage: str,
        payload: dict[str, Any],
        *,
        conn: Any = ...,
    ) -> AnswerRecord: ...


class PersonaRepo(Protocol):
    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None: ...
    async def create(
        self, session_id: UUID, persona: Persona, *, conn: Any = ...
    ) -> PersonaRecord: ...


class TxPool(Protocol):
    def transaction(self) -> AbstractAsyncContextManager[Any]: ...


class CardRepo(Protocol):
    async def get_by_persona(self, persona_id: UUID) -> CardRecord | None: ...


class SettingsRepo(Protocol):
    async def get(self, key: str) -> object | None: ...


class CardImageStorage(Protocol):
    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str: ...


class SessionService:
    """세션 시작/답변 흐름(별도 작업)과 프로필 요약 조회."""

    def __init__(
        self,
        *,
        students: StudentRepo,
        sessions: SessionRepo,
        personas: PersonaRepo,
        cards: CardRepo,
        settings_repo: SettingsRepo,
        storage: CardImageStorage,
        settings: Settings,
        db_pool: TxPool,
    ) -> None:
        self._students = students
        self._sessions = sessions
        self._personas = personas
        self._cards = cards
        self._settings_repo = settings_repo
        self._storage = storage
        self._settings = settings
        self._db_pool = db_pool

    async def get_profile_summary(self, student_id: UUID) -> ProfileSummary:
        """프로필 화면 상태를 조립한다.

        완료 판단 = 가장 최근 세션이 completed. 미완료/세션 없음은 동일하게
        has_completed=false 로 내린다. 완료 시 persona→card 까지 따라간다.
        """
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY))
        student = await self._fetch_student_info(student_id)

        # 진행 중(in_progress) 세션이 있어도 완료 판정은 최근 '완료' 세션 기준.
        latest = await self._sessions.get_latest_completed_for_student(student_id)
        if latest is None:
            return ProfileSummary(
                has_completed=False,
                retry_enabled=retry_enabled,
                student=student,
                persona=None,
                card=None,
            )

        persona = await self._personas.get_by_session(latest.id)
        if persona is None:
            # 완료 상태인데 페르소나가 없는 비정상 케이스 — 완료로 표시하되 내용은 비운다.
            return ProfileSummary(
                has_completed=True,
                retry_enabled=retry_enabled,
                student=student,
                persona=None,
                card=None,
            )

        return ProfileSummary(
            has_completed=True,
            retry_enabled=retry_enabled,
            student=student,
            persona=PersonaSummary(
                name=persona.name,
                tagline=persona.tagline,
                keywords=persona.keywords,
                fields=persona.fields,
            ),
            card=await self._build_card_summary(persona.id),
        )

    async def submit_answer(
        self,
        student_id: UUID,
        session_id: UUID | None,
        stage: str,
        answer: dict[str, Any],
    ) -> UUID:
        """진행 중(Q7~9) 답변 저장. 세션이 없으면 새 in_progress 세션을 만든다.

        - session_id가 None: 새 in_progress 세션 생성 + 첫 답변 삽입을 한 트랜잭션으로
          원자화한다. 삽입이 실패/취소되면 세션 생성도 함께 롤백되어, '답변 없는
          유령 세션'이 남거나 그 stage 답변만 유실되는 일이 없다.
        - session_id가 있으면: 소유·상태 검증(내 세션 + in_progress) 후 저장.
        반환값은 이후 저장/완료에서 재사용할 세션 id.
        """
        if session_id is None:
            async with self._db_pool.transaction() as conn:
                session = await self._sessions.create(student_id, status="in_progress", conn=conn)
                await self._sessions.insert_answer(session.id, stage, answer, conn=conn)
            return session.id

        existing = await self._sessions.get_by_id(session_id)
        if existing is None:
            raise NotFoundError("세션을 찾을 수 없습니다.")
        if existing.student_id != student_id:
            raise ForbiddenError("이 세션에 접근할 수 없습니다.")
        if existing.status != "in_progress":
            raise ConflictError("이미 종료된 세션입니다.")

        await self._sessions.insert_answer(session_id, stage, answer)
        return session_id

    async def complete_survey(
        self,
        student_id: UUID,
        persona: Persona | None,
        session_id: UUID | None = None,
    ) -> ProfileSummary:
        """세션 completed 승격(+ persona가 있으면 원자적으로 저장).

        학생 흐름은 Q9가 마지막이라 보통 persona=None으로 호출한다. 이 경우 세션만
        completed로 올리고 페르소나는 저장하지 않아 프로필이 '완료 · 카드 준비 중'이 된다.
        persona가 주어지면 함께 저장한다.

        최근 '완료' 세션이 있고 retry_enabled가 false면 409(ConflictError).
        session_id가 주어지면 그 in_progress 세션을 completed로 올리고(진행 중 답변 유지),
        없으면 새 completed 세션을 만든다. 상태 변경/생성과 persona INSERT는 한 트랜잭션.
        """
        latest = await self._sessions.get_latest_completed_for_student(student_id)
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY))
        if latest is not None and not retry_enabled:
            raise ConflictError("이미 설문을 완료했습니다.")

        # 넘어온 세션이 내 것이고 아직 진행 중일 때만 재사용, 아니면 새로 만든다.
        reuse: UUID | None = None
        if session_id is not None:
            existing = await self._sessions.get_by_id(session_id)
            if (
                existing is not None
                and existing.student_id == student_id
                and existing.status == "in_progress"
            ):
                reuse = session_id

        async with self._db_pool.transaction() as conn:
            if reuse is not None:
                session = await self._sessions.update_status(reuse, "completed", conn=conn)
            else:
                session = await self._sessions.create(student_id, status="completed", conn=conn)
            # 이름 선택이 없는 완료(Q9가 마지막)면 persona는 저장하지 않는다.
            if persona is not None:
                await self._personas.create(session.id, persona, conn=conn)

        return await self.get_profile_summary(student_id)

    async def _fetch_student_info(self, student_id: UUID) -> StudentInfo | None:
        """학생 식별 정보 조회. 소프트 삭제/없음이면 None(비밀번호는 노출하지 않음)."""
        student = await self._students.get_by_id(student_id)
        if student is None:
            return None
        # 사진이 있으면 카드 이미지와 동일하게 Presigned URL로 내린다.
        photo_url: str | None = None
        if student.photo_key:
            photo_url = await self._storage.create_signed_url(
                student.photo_key,
                ttl_seconds=self._settings.share_link_ttl_hours * 3600,
            )
        return StudentInfo(
            school=student.school,
            grade=student.grade,
            class_no=student.class_no,
            student_no=student.student_no,
            name=student.name,
            gender=student.gender,
            photo_url=photo_url,
        )

    async def _build_card_summary(self, persona_id: UUID) -> CardSummary | None:
        """카드 이미지가 있으면 Presigned URL로, 없으면 None."""
        card = await self._cards.get_by_persona(persona_id)
        if card is None or card.card_image_key is None:
            return None
        url = await self._storage.create_signed_url(
            card.card_image_key,
            ttl_seconds=self._settings.share_link_ttl_hours * 3600,
        )
        return CardSummary(card_image_url=url)

    # 세션 시작/다음 질문 흐름은 아직 별도 작업 영역 — 스텁 유지.
    async def start(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_next_question(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
