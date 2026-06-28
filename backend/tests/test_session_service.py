"""SessionService.get_profile_summary 단위 테스트 — fake 저장소/스토리지 주입."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.config import get_settings
from app.repositories.card_repo import CardRecord
from app.repositories.persona_repo import PersonaRecord
from app.repositories.session_repo import SessionRecord
from app.repositories.student_repo import StudentRecord
from app.services.session_service import SessionService


class FakeStudentRepo:
    def __init__(self, student: StudentRecord | None = None) -> None:
        self.student = student

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None:
        return self.student


class FakeSessionRepo:
    def __init__(self, latest: SessionRecord | None = None) -> None:
        self.latest = latest

    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None:
        return self.latest


class FakePersonaRepo:
    def __init__(self, persona: PersonaRecord | None = None) -> None:
        self.persona = persona

    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None:
        return self.persona


class FakeCardRepo:
    def __init__(self, card: CardRecord | None = None) -> None:
        self.card = card

    async def get_by_persona(self, persona_id: UUID) -> CardRecord | None:
        return self.card


class FakeSettingsRepo:
    def __init__(self, value: object | None = False) -> None:
        self.value = value

    async def get(self, key: str) -> object | None:
        return self.value


class FakeStorage:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int]] = []

    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        self.calls.append((key, ttl_seconds))
        return f"https://signed.example/{key}?ttl={ttl_seconds}"


def _student() -> StudentRecord:
    return StudentRecord(
        id=uuid4(),
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        photo_key=None,
        consent_privacy=True,
        created_at=datetime.now(UTC),
        deleted_at=None,
    )


def _session(status: str) -> SessionRecord:
    return SessionRecord(
        id=uuid4(),
        student_id=uuid4(),
        status=status,
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC) if status == "completed" else None,
    )


def _persona() -> PersonaRecord:
    return PersonaRecord(
        id=uuid4(),
        session_id=uuid4(),
        name="미래의 탐험가",
        tagline="세상을 누비는 사람",
        keywords=["호기심", "모험"],
        fields=["여행", "탐사"],
        created_at=datetime.now(UTC),
    )


def _build(
    *,
    latest: SessionRecord | None,
    persona: PersonaRecord | None = None,
    card: CardRecord | None = None,
    retry: object = False,
    student: StudentRecord | None = None,
) -> tuple[SessionService, FakeStorage]:
    storage = FakeStorage()
    service = SessionService(
        students=FakeStudentRepo(student or _student()),
        sessions=FakeSessionRepo(latest),
        personas=FakePersonaRepo(persona),
        cards=FakeCardRepo(card),
        settings_repo=FakeSettingsRepo(retry),
        storage=storage,
        settings=get_settings(),
    )
    return service, storage


async def test_no_session_returns_not_completed() -> None:
    # 가장 흔한 엣지 케이스: 세션 0개 → 500이 아니라 has_completed False.
    service, storage = _build(latest=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is False
    assert summary.persona is None
    assert summary.card is None
    assert summary.retry_enabled is False
    assert storage.calls == []
    # 학생 정보는 설문 완료 여부와 무관하게 함께 내려간다.
    assert summary.student is not None
    assert summary.student.name == "홍길동"
    assert summary.student.school == "한마당고"
    # 사진 키가 없으면 photo_url은 None이고 서명 호출도 없다.
    assert summary.student.photo_url is None


async def test_student_photo_key_returns_signed_url() -> None:
    # 사진이 있으면 카드 이미지와 동일하게 Presigned URL로 내려준다.
    student = replace(_student(), photo_key="uploads/stu/photo")
    service, storage = _build(latest=None, student=student)

    summary = await service.get_profile_summary(uuid4())

    assert summary.student is not None
    assert summary.student.photo_url == "https://signed.example/uploads/stu/photo?ttl=86400"
    assert storage.calls == [("uploads/stu/photo", 86400)]


async def test_in_progress_session_is_not_completed() -> None:
    service, _ = _build(latest=_session("in_progress"), persona=_persona())
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is False
    assert summary.persona is None


async def test_abandoned_session_is_not_completed() -> None:
    service, _ = _build(latest=_session("abandoned"))
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is False


async def test_completed_with_card_returns_persona_and_signed_url() -> None:
    persona = _persona()
    card = CardRecord(
        id=uuid4(),
        persona_id=persona.id,
        card_image_key="cards/abc.png",
        created_at=datetime.now(UTC),
    )
    service, storage = _build(latest=_session("completed"), persona=persona, card=card)

    summary = await service.get_profile_summary(uuid4())

    assert summary.has_completed is True
    assert summary.persona is not None
    assert summary.persona.name == "미래의 탐험가"
    assert summary.persona.keywords == ["호기심", "모험"]
    assert summary.card is not None
    assert summary.card.card_image_url == "https://signed.example/cards/abc.png?ttl=86400"
    assert storage.calls == [("cards/abc.png", 86400)]


async def test_completed_without_card_image_key_returns_null_card() -> None:
    persona = _persona()
    card = CardRecord(
        id=uuid4(), persona_id=persona.id, card_image_key=None, created_at=datetime.now(UTC)
    )
    service, storage = _build(latest=_session("completed"), persona=persona, card=card)

    summary = await service.get_profile_summary(uuid4())

    assert summary.has_completed is True
    assert summary.persona is not None
    assert summary.card is None
    assert storage.calls == []  # 키 없으면 presigned 호출 안 함


async def test_completed_without_card_row_returns_null_card() -> None:
    service, _ = _build(latest=_session("completed"), persona=_persona(), card=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is True
    assert summary.card is None


async def test_completed_without_persona_returns_completed_but_empty() -> None:
    service, _ = _build(latest=_session("completed"), persona=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is True
    assert summary.persona is None
    assert summary.card is None


async def test_retry_enabled_flag_propagates() -> None:
    service, _ = _build(latest=None, retry=True)
    summary = await service.get_profile_summary(uuid4())
    assert summary.retry_enabled is True


async def test_student_info_included_when_completed() -> None:
    service, _ = _build(latest=_session("completed"), persona=_persona())
    summary = await service.get_profile_summary(uuid4())
    assert summary.student is not None
    assert summary.student.grade == 2
    assert summary.student.class_no == 3
    assert summary.student.student_no == 11


async def test_missing_student_returns_none_student() -> None:
    # 소프트 삭제 등으로 학생 레코드가 없으면 student는 None (비밀번호 등 노출 없음).
    storage = FakeStorage()
    service = SessionService(
        students=FakeStudentRepo(None),
        sessions=FakeSessionRepo(None),
        personas=FakePersonaRepo(None),
        cards=FakeCardRepo(None),
        settings_repo=FakeSettingsRepo(False),
        storage=storage,
        settings=get_settings(),
    )
    summary = await service.get_profile_summary(uuid4())
    assert summary.student is None
    assert summary.has_completed is False
