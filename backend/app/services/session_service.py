"""세션 생성, 답변 저장, 프로필 요약 등 세션 관련 비즈니스 로직."""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from uuid import UUID

from app.config import Settings
from app.core.competencies import COMPETENCY_KEYS, COMPETENCY_LABELS
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidStageError,
    NotFoundError,
    SessionCompletedError,
    SessionSupersededError,
)
from app.core.profile_share import profile_share_code, read_profile_share_code
from app.repositories.booth_repo import BoothRecord
from app.repositories.booth_visit_repo import BoothVisitRecord
from app.repositories.card_repo import CardRecord
from app.repositories.persona_repo import PersonaRecord
from app.repositories.session_repo import AnswerRecord, SessionRecord
from app.repositories.student_repo import StudentRecord
from app.schemas.persona import Persona
from app.schemas.students import (
    CardSummary,
    PersonaSummary,
    ProfileBoothStatus,
    ProfileCompetencyScore,
    ProfileSummary,
    PublicProfileSummary,
    StudentInfo,
)

# 행사 전역 '다시 하기' 스위치 키.
RETRY_ENABLED_KEY = "retry_enabled"

# 저장을 허용하는 stage. q1to6은 Q1~6 결과를 한 번에 담고, q7a~q9는 단계별.
# q9가 마지막 질문이며, 이후 /complete로 세션을 완료한다.
ANSWER_STAGES = frozenset({"q1to6", "q7a", "q7b", "q8", "q9"})


def compute_competency_scores(
    *,
    booth_competencies: dict[UUID, tuple[str, ...]],
    visited_booth_ids: set[UUID],
) -> list[ProfileCompetencyScore]:
    """방문한 부스의 역량을 1점씩 더해 10개 축을 만든다.

    점수를 저장하지 않고 조회할 때마다 센다. 매핑이 나중에 바뀌어도 재계산이 필요 없고,
    학생 1명당 최대 부스 수만큼만 도는 계산이라 비용이 문제되지 않는다.

    클래스 밖에 두는 이유는 테스트다 — DB도 서비스 조립도 없이 부를 수 있다.
    """
    counts = dict.fromkeys(COMPETENCY_KEYS, 0)
    for booth_id in visited_booth_ids:
        for competency in booth_competencies.get(booth_id, ()):
            # 알 수 없는 값은 건너뛴다. 역량 목록에서 항목을 뺐는데 DB에 남아 있는 경우.
            if competency in counts:
                counts[competency] += 1
    return [
        ProfileCompetencyScore(key=key, label=COMPETENCY_LABELS[key], score=counts[key])
        for key in COMPETENCY_KEYS
    ]


class StudentRepo(Protocol):
    async def get_by_id(self, student_id: UUID) -> StudentRecord | None: ...


class SessionRepo(Protocol):
    async def lock_student(self, student_id: UUID, *, conn: Any) -> None: ...
    async def get_request(
        self, student_id: UUID, request_id: UUID, *, conn: Any
    ) -> tuple[bool, UUID | None]: ...
    async def remember_request(
        self, student_id: UUID, request_id: UUID, session_id: UUID, *, conn: Any
    ) -> None: ...
    async def abandon_in_progress(self, student_id: UUID, *, conn: Any) -> None: ...
    async def delete_completed_for_student(self, student_id: UUID, *, conn: Any = ...) -> None: ...
    async def get_by_id(self, session_id: UUID, *, conn: Any = ...) -> SessionRecord | None: ...
    async def get_latest_for_student(
        self, student_id: UUID, *, conn: Any = ...
    ) -> SessionRecord | None: ...
    async def get_latest_completed_for_student(
        self, student_id: UUID, *, conn: Any = ...
    ) -> SessionRecord | None: ...
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
        self,
        session_id: UUID,
        *,
        name: str,
        tagline: str,
        keywords: list[str],
        fields: list[str],
        conn: Any = ...,
    ) -> PersonaRecord: ...


class TxPool(Protocol):
    def transaction(self) -> AbstractAsyncContextManager[Any]: ...


class CardRepo(Protocol):
    async def get_by_persona(self, persona_id: UUID) -> CardRecord | None: ...


class SettingsRepo(Protocol):
    async def get(self, key: str) -> object | None: ...


class CardImageStorage(Protocol):
    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str: ...


class BoothRepo(Protocol):
    async def list_all(self) -> list[BoothRecord]: ...


class BoothVisitRepo(Protocol):
    async def list_for_student(self, student_id: UUID) -> list[BoothVisitRecord]: ...


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
        booths: BoothRepo,
        visits: BoothVisitRepo,
    ) -> None:
        self._students = students
        self._sessions = sessions
        self._personas = personas
        self._cards = cards
        self._settings_repo = settings_repo
        self._storage = storage
        self._settings = settings
        self._db_pool = db_pool
        self._booths = booths
        self._visits = visits

    async def get_profile_summary(self, student_id: UUID) -> ProfileSummary:
        """프로필 화면 상태를 조립한다.

        완료 판단 = 가장 최근 세션이 completed. 미완료/세션 없음은 동일하게
        has_completed=false 로 내린다. 완료 시 persona→card 까지 따라간다.
        """
        record = await self._students.get_by_id(student_id)
        share_path = (
            f"/p/{profile_share_code(student_id, self._settings)}/home"
            if record is not None and record.kind == "test" and record.deleted_at is None
            else None
        )
        # 테스트 계정은 전역 스위치와 무관하게 항상 다시 할 수 있다 — 그래야 계정 하나로
        # 반복 테스트가 되고, 테스트할 때마다 새 계정을 만들어 DB에 쌓지 않는다.
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY)) or (
            record is not None and record.kind == "test"
        )
        student = await self._build_student_info(record)
        booths, competencies = await self._list_booth_statuses(student_id)

        # 진행 중(in_progress) 세션이 있어도 완료 판정은 최근 '완료' 세션 기준.
        latest = await self._sessions.get_latest_completed_for_student(student_id)
        if latest is None:
            return ProfileSummary(
                has_completed=False,
                share_path=share_path,
                retry_enabled=retry_enabled,
                student=student,
                persona=None,
                card=None,
                booths=booths,
                competencies=competencies,
            )

        persona = await self._personas.get_by_session(latest.id)
        if persona is None:
            # 완료 상태인데 페르소나가 없는 비정상 케이스 — 완료로 표시하되 내용은 비운다.
            return ProfileSummary(
                has_completed=True,
                share_path=share_path,
                completed_session_id=latest.id,
                retry_enabled=retry_enabled,
                student=student,
                persona=None,
                card=None,
                booths=booths,
                competencies=competencies,
            )

        return ProfileSummary(
            has_completed=True,
            share_path=share_path,
            completed_session_id=latest.id,
            retry_enabled=retry_enabled,
            student=student,
            booths=booths,
            competencies=competencies,
            persona=PersonaSummary(
                name=persona.name,
                tagline=persona.tagline,
                keywords=persona.keywords,
                fields=persona.fields,
            ),
            card=await self._build_card_summary(persona.id),
        )

    async def get_public_profile(self, code: str) -> PublicProfileSummary:
        student_id = read_profile_share_code(code, self._settings)
        record = await self._students.get_by_id(student_id)
        if record is None or record.kind != "test" or record.deleted_at is not None:
            raise NotFoundError("공유 페이지를 찾을 수 없습니다.")
        # 비공개 프로필을 재사용하지 않는다. 원본 사진 URL·이름·학적 정보를 만들지 않는다.
        booths, competencies = await self._list_booth_statuses(student_id)
        latest = await self._sessions.get_latest_completed_for_student(student_id)
        persona = await self._personas.get_by_session(latest.id) if latest else None
        return PublicProfileSummary(
            persona=PersonaSummary(
                name=persona.name,
                tagline=persona.tagline,
                keywords=persona.keywords,
                fields=persona.fields,
            )
            if persona
            else None,
            card=await self._build_card_summary(persona.id) if persona else None,
            booths=booths,
            competencies=competencies,
        )

    @staticmethod
    def _check_active(existing: SessionRecord | None, student_id: UUID) -> SessionRecord:
        if existing is None:
            raise NotFoundError("세션을 찾을 수 없습니다. 새로고침해 주세요.")
        if existing.student_id != student_id:
            raise ForbiddenError("이 세션에 접근할 수 없습니다.")
        if existing.status == "completed":
            raise SessionCompletedError("이미 완료된 세션입니다.")
        if existing.status != "in_progress":
            raise SessionSupersededError(
                "다른 화면에서 설문을 다시 시작했습니다. 새로고침해 주세요."
            )
        return existing

    async def submit_answer(
        self,
        student_id: UUID,
        session_id: UUID | None,
        stage: str,
        answer: dict[str, Any],
        *,
        request_id: UUID | None = None,
    ) -> UUID:
        """학생 잠금 아래 세션 확보·답변 저장을 원자적으로 실행한다."""
        if stage not in ANSWER_STAGES:
            raise InvalidStageError(
                f"저장할 수 없는 stage입니다: {stage}", details={"allowed": sorted(ANSWER_STAGES)}
            )
        async with self._db_pool.transaction() as conn:
            await self._sessions.lock_student(student_id, conn=conn)
            if session_id is None:
                found, remembered = (
                    await self._sessions.get_request(student_id, request_id, conn=conn)
                    if request_id
                    else (False, None)
                )
                if found:
                    if remembered is None:
                        raise SessionSupersededError("이전 설문 요청입니다. 새로고침해 주세요.")
                    session_id = remembered
                else:
                    latest = await self._sessions.get_latest_for_student(student_id, conn=conn)
                    if latest is not None:
                        # 새 클라이언트는 식별자가 없는 낡은 탭을 다른 시도에 합치지 않는다.
                        if request_id is not None or latest.status != "in_progress":
                            raise SessionSupersededError(
                                "이미 시작한 설문이 있습니다. 새로고침해 주세요."
                            )
                        session_id = latest.id  # 구버전 클라이언트의 응답 유실도 중복 생성 방지
                    else:
                        session = await self._sessions.create(student_id, conn=conn)
                        session_id = session.id
                    if request_id is not None:
                        await self._sessions.remember_request(
                            student_id, request_id, session_id, conn=conn
                        )
            existing = await self._sessions.get_by_id(session_id, conn=conn)
            self._check_active(existing, student_id)
            await self._sessions.insert_answer(session_id, stage, answer, conn=conn)
        return session_id

    async def restart_survey(
        self, student_id: UUID, request_id: UUID, source_session_id: UUID
    ) -> UUID:
        """같은 재시작 요청은 한 번만 처리. 오래된 탭은 새 완료 결과를 지울 수 없다."""
        async with self._db_pool.transaction() as conn:
            await self._sessions.lock_student(student_id, conn=conn)
            found, remembered = await self._sessions.get_request(student_id, request_id, conn=conn)
            if found:
                if remembered is None:
                    raise SessionSupersededError("이미 교체된 설문 요청입니다. 새로고침해 주세요.")
                existing = await self._sessions.get_by_id(remembered, conn=conn)
                if existing is None or existing.status == "abandoned":
                    raise SessionSupersededError("이미 교체된 설문 요청입니다. 새로고침해 주세요.")
                return remembered
            latest = await self._sessions.get_latest_completed_for_student(student_id, conn=conn)
            if latest is None or latest.id != source_session_id:
                raise SessionSupersededError("설문 상태가 변경되었습니다. 새로고침해 주세요.")
            await self._sessions.abandon_in_progress(student_id, conn=conn)
            await self._sessions.delete_completed_for_student(student_id, conn=conn)
            session = await self._sessions.create(student_id, conn=conn)
            await self._sessions.remember_request(student_id, request_id, session.id, conn=conn)
            return session.id

    async def complete_survey(
        self,
        student_id: UUID,
        persona: Persona | None,
        session_id: UUID | None = None,
    ) -> ProfileSummary:
        record = await self._students.get_by_id(student_id)
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY)) or (
            record is not None and record.kind == "test"
        )
        async with self._db_pool.transaction() as conn:
            await self._sessions.lock_student(student_id, conn=conn)
            existing = None
            if session_id is not None:
                existing = await self._sessions.get_by_id(session_id, conn=conn)
                if existing is None:
                    raise NotFoundError("세션을 찾을 수 없습니다.")
                if existing.student_id != student_id:
                    raise ForbiddenError("이 세션에 접근할 수 없습니다.")
                if existing.status not in ("in_progress", "completed"):
                    raise SessionSupersededError("이미 교체된 설문입니다. 새로고침해 주세요.")
            # 같은 완료 요청 재전송은 retry_enabled와 무관하게 성공이다.
            if existing is None or existing.status != "completed":
                latest = await self._sessions.get_latest_completed_for_student(
                    student_id, conn=conn
                )
                if latest is not None and not retry_enabled:
                    raise ConflictError("이미 설문을 완료했습니다.")
                if existing is not None:
                    session = await self._sessions.update_status(
                        existing.id, "completed", conn=conn
                    )
                else:
                    session = await self._sessions.create(student_id, status="completed", conn=conn)
                if persona is not None:
                    await self._personas.create(
                        session.id,
                        name=persona.name,
                        tagline=persona.tagline,
                        keywords=list(persona.keywords),
                        fields=list(persona.fields),
                        conn=conn,
                    )
        return await self.get_profile_summary(student_id)

    async def _build_student_info(self, student: StudentRecord | None) -> StudentInfo | None:
        """학생 레코드 → 응답 모델. 없으면 None(비밀번호는 노출하지 않음)."""
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

    async def _list_booth_statuses(
        self, student_id: UUID
    ) -> tuple[list[ProfileBoothStatus], list[ProfileCompetencyScore]]:
        """전체 부스에 방문 여부를 표시하고, 방문한 부스의 역량을 세어 함께 반환한다.

        부스는 행사당 수십 개 수준이라 조인 없이 두 번 조회 후 파이썬에서 합친다.
        """
        all_booths = await self._booths.list_all()
        visits = await self._visits.list_for_student(student_id)
        visited_at = {v.booth_id: v.created_at for v in visits}
        visited_ids = set(visited_at)
        statuses = [
            ProfileBoothStatus(
                id=booth.id,
                name=booth.name,
                visited=booth.id in visited_ids,
                zone=booth.zone,
                description=booth.description,
                competencies=list(booth.competencies),
                visited_at=visited_at.get(booth.id),
            )
            for booth in all_booths
        ]
        scores = compute_competency_scores(
            booth_competencies={b.id: b.competencies for b in all_booths},
            visited_booth_ids=visited_ids,
        )
        return statuses, scores

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
