"""세션 생성, 답변 저장, 프로필 요약 등 세션 관련 비즈니스 로직."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.config import Settings
from app.repositories.card_repo import CardRecord
from app.repositories.persona_repo import PersonaRecord
from app.repositories.session_repo import SessionRecord
from app.repositories.student_repo import StudentRecord
from app.schemas.students import CardSummary, PersonaSummary, ProfileSummary, StudentInfo

# 행사 전역 '다시 하기' 스위치 키.
RETRY_ENABLED_KEY = "retry_enabled"


class StudentRepo(Protocol):
    async def get_by_id(self, student_id: UUID) -> StudentRecord | None: ...


class SessionRepo(Protocol):
    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None: ...


class PersonaRepo(Protocol):
    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None: ...


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
    ) -> None:
        self._students = students
        self._sessions = sessions
        self._personas = personas
        self._cards = cards
        self._settings_repo = settings_repo
        self._storage = storage
        self._settings = settings

    async def get_profile_summary(self, student_id: UUID) -> ProfileSummary:
        """프로필 화면 상태를 조립한다.

        완료 판단 = 가장 최근 세션이 completed. 미완료/세션 없음은 동일하게
        has_completed=false 로 내린다. 완료 시 persona→card 까지 따라간다.
        """
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY))
        student = await self._fetch_student_info(student_id)

        latest = await self._sessions.get_latest_for_student(student_id)
        if latest is None or latest.status != "completed":
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

    # 아래는 질문 진행 흐름(별도 작업 영역) — 이번 범위 밖이라 스텁 유지.
    async def start(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def submit_answer(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_next_question(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
