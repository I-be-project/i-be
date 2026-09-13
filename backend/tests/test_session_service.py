"""SessionService.get_profile_summary 단위 테스트 — fake 저장소/스토리지 주입."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, InvalidStageError, NotFoundError
from app.repositories.booth_repo import BoothRecord
from app.repositories.booth_visit_repo import BoothVisitRecord
from app.repositories.card_repo import CardRecord
from app.repositories.persona_repo import PersonaRecord
from app.repositories.session_repo import SessionRecord
from app.repositories.student_repo import StudentRecord
from app.schemas.persona import Persona
from app.schemas.students import ProfileBoothStatus
from app.services.session_service import ANSWER_STAGES, SessionService


class FakeStudentRepo:
    def __init__(self, student: StudentRecord | None = None) -> None:
        self.student = student

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None:
        return self.student


class FakeSessionRepo:
    def __init__(self, latest: SessionRecord | None = None) -> None:
        self.latest = latest
        self.created: list[SessionRecord] = []
        self.inserted: list[tuple[UUID, str, dict[str, Any]]] = []
        # 원자성 검증용 — create/insert_answer가 받은 conn(동일 트랜잭션인지 확인).
        self.create_conn: Any = None
        self.insert_conn: Any = None

    async def get_by_id(self, session_id: UUID) -> SessionRecord | None:
        for rec in (self.latest, *self.created):
            if rec is not None and rec.id == session_id:
                return rec
        return None

    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None:
        return self.latest

    async def get_latest_completed_for_student(self, student_id: UUID) -> SessionRecord | None:
        if self.latest is not None and self.latest.status == "completed":
            return self.latest
        return None

    async def create(
        self, student_id: UUID, *, status: str = "in_progress", conn: Any = None
    ) -> SessionRecord:
        self.create_conn = conn
        rec = SessionRecord(
            id=uuid4(),
            student_id=student_id,
            status=status,
            created_at=datetime.now(UTC),
            completed_at=datetime.now(UTC) if status == "completed" else None,
        )
        self.created.append(rec)
        self.latest = rec  # 이후 get_profile_summary가 최신 세션으로 보게 함
        return rec

    async def update_status(
        self, session_id: UUID, status: str, *, conn: Any = None
    ) -> SessionRecord:
        assert self.latest is not None
        updated = replace(
            self.latest,
            status=status,
            completed_at=datetime.now(UTC) if status == "completed" else self.latest.completed_at,
        )
        self.latest = updated
        return updated

    async def insert_answer(
        self, session_id: UUID, stage: str, payload: dict[str, Any], *, conn: Any = None
    ) -> object:
        self.insert_conn = conn
        self.inserted.append((session_id, stage, payload))
        return object()


class FakePersonaRepo:
    def __init__(self, persona: PersonaRecord | None = None) -> None:
        self.persona = persona
        self.created: list[PersonaRecord] = []

    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None:
        return self.persona

    async def create(
        self,
        session_id: UUID,
        *,
        name: str,
        tagline: str,
        keywords: list[str],
        fields: list[str],
        conn: Any = None,
    ) -> PersonaRecord:
        rec = PersonaRecord(
            id=uuid4(),
            session_id=session_id,
            name=name,
            tagline=tagline,
            keywords=list(keywords),
            fields=list(fields),
            created_at=datetime.now(UTC),
        )
        self.created.append(rec)
        self.persona = rec
        return rec


class FakeCardRepo:
    def __init__(self, card: CardRecord | None = None) -> None:
        self.card = card

    async def get_by_persona(self, persona_id: UUID) -> CardRecord | None:
        return self.card


class FakeBoothRepo:
    def __init__(self, booths: list[BoothRecord] | None = None) -> None:
        self.booths = booths or []

    async def list_all(self) -> list[BoothRecord]:
        return self.booths


class FakeBoothVisitRepo:
    def __init__(self, visits: list[BoothVisitRecord] | None = None) -> None:
        self.visits = visits or []

    async def list_for_student(self, student_id: UUID) -> list[BoothVisitRecord]:
        return [v for v in self.visits if v.student_id == student_id]


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


class FakeDBPool:
    def __init__(self) -> None:
        self.entered = False
        self.conn = object()  # 트랜잭션이 넘기는 커넥션 식별용 sentinel

    @asynccontextmanager
    async def transaction(self):
        self.entered = True
        yield self.conn


def _student() -> StudentRecord:
    return StudentRecord(
        id=uuid4(),
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        gender="male",
        birth_date=None,
        photo_key=None,
        consent_privacy=True,
        kind="student",
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


def _booth(
    name: str = "체험부스",
    *,
    competencies: tuple[str, ...] = (),
    zone: str = "",
    description: str | None = None,
) -> BoothRecord:
    return BoothRecord(
        id=uuid4(),
        code="ABC123",
        name=name,
        description=description,
        zone=zone,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        competencies=competencies,
    )


def _visit(*, student_id: UUID, booth_id: UUID) -> BoothVisitRecord:
    return BoothVisitRecord(
        id=uuid4(),
        student_id=student_id,
        booth_id=booth_id,
        created_at=datetime.now(UTC),
    )


def _build(
    *,
    latest: SessionRecord | None,
    persona: PersonaRecord | None = None,
    card: CardRecord | None = None,
    retry: object = False,
    student: StudentRecord | None = None,
    booths: list[BoothRecord] | None = None,
    visits: list[BoothVisitRecord] | None = None,
) -> tuple[SessionService, FakeStorage, FakeDBPool]:
    storage = FakeStorage()
    db_pool = FakeDBPool()
    service = SessionService(
        students=FakeStudentRepo(student or _student()),
        sessions=FakeSessionRepo(latest),
        personas=FakePersonaRepo(persona),
        cards=FakeCardRepo(card),
        settings_repo=FakeSettingsRepo(retry),
        storage=storage,
        settings=get_settings(),
        db_pool=db_pool,
        booths=FakeBoothRepo(booths),
        visits=FakeBoothVisitRepo(visits),
    )
    return service, storage, db_pool


async def test_no_session_returns_not_completed() -> None:
    # 가장 흔한 엣지 케이스: 세션 0개 → 500이 아니라 has_completed False.
    service, storage, _ = _build(latest=None)
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
    service, storage, _ = _build(latest=None, student=student)

    summary = await service.get_profile_summary(uuid4())

    assert summary.student is not None
    assert summary.student.photo_url == "https://signed.example/uploads/stu/photo?ttl=86400"
    assert storage.calls == [("uploads/stu/photo", 86400)]


async def test_in_progress_session_is_not_completed() -> None:
    service, _, _ = _build(latest=_session("in_progress"), persona=_persona())
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is False
    assert summary.persona is None


async def test_abandoned_session_is_not_completed() -> None:
    service, _, _ = _build(latest=_session("abandoned"))
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
    service, storage, _ = _build(latest=_session("completed"), persona=persona, card=card)

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
    service, storage, _ = _build(latest=_session("completed"), persona=persona, card=card)

    summary = await service.get_profile_summary(uuid4())

    assert summary.has_completed is True
    assert summary.persona is not None
    assert summary.card is None
    assert storage.calls == []  # 키 없으면 presigned 호출 안 함


async def test_completed_without_card_row_returns_null_card() -> None:
    service, _, _ = _build(latest=_session("completed"), persona=_persona(), card=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is True
    assert summary.card is None


async def test_completed_without_persona_returns_completed_but_empty() -> None:
    service, _, _ = _build(latest=_session("completed"), persona=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.has_completed is True
    assert summary.persona is None
    assert summary.card is None


async def test_retry_enabled_flag_propagates() -> None:
    service, _, _ = _build(latest=None, retry=True)
    summary = await service.get_profile_summary(uuid4())
    assert summary.retry_enabled is True


async def test_test_account_profile_reports_retry_enabled() -> None:
    """테스트 계정 프로필은 전역 스위치가 꺼져 있어도 retry_enabled=true로 내려간다."""
    student = replace(_student(), kind="test")
    service, _, _ = _build(latest=None, retry=False, student=student)

    summary = await service.get_profile_summary(student.id)

    assert summary.retry_enabled is True


async def test_student_info_included_when_completed() -> None:
    service, _, _ = _build(latest=_session("completed"), persona=_persona())
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
        db_pool=FakeDBPool(),
        booths=FakeBoothRepo(),
        visits=FakeBoothVisitRepo(),
    )
    summary = await service.get_profile_summary(uuid4())
    assert summary.student is None
    assert summary.has_completed is False


async def test_profile_summary_marks_visited_booths() -> None:
    student_id = uuid4()
    visited = _booth("방문한 부스")
    unvisited = _booth("안 가본 부스")
    service, _, _ = _build(
        latest=None,
        booths=[visited, unvisited],
        visits=[_visit(student_id=student_id, booth_id=visited.id)],
    )

    summary = await service.get_profile_summary(student_id)

    assert {b.id: b.visited for b in summary.booths} == {
        visited.id: True,
        unvisited.id: False,
    }
    assert [b.name for b in summary.booths] == ["방문한 부스", "안 가본 부스"]


async def test_profile_summary_ignores_other_students_visits() -> None:
    # 방문 기록은 student_id로 걸러져야 한다 — 다른 학생 기록이 섞이면 안 된다.
    booth = _booth()
    service, _, _ = _build(
        latest=None,
        booths=[booth],
        visits=[_visit(student_id=uuid4(), booth_id=booth.id)],
    )

    summary = await service.get_profile_summary(uuid4())

    assert summary.booths == [ProfileBoothStatus(id=booth.id, name=booth.name, visited=False)]


async def test_profile_summary_carries_booth_details() -> None:
    """부스 탭 카드가 쓰는 존·설명·역량·방문 시각이 프로필 응답에 실려야 한다.

    이 필드들은 이미 조회한 레코드에서 옮겨 담기만 하면 되는데, 옮기는 걸 빠뜨려도
    이름과 visited는 맞아서 다른 테스트가 전부 통과한다 — 그래서 따로 못 박는다.
    """
    student_id = uuid4()
    booth = _booth(
        "스피치ON", competencies=("communication",), zone="C", description="자기소개 미션"
    )
    visit = _visit(student_id=student_id, booth_id=booth.id)
    service, _, _ = _build(latest=None, booths=[booth], visits=[visit])

    status = (await service.get_profile_summary(student_id)).booths[0]

    assert status.zone == "C"
    assert status.description == "자기소개 미션"
    assert status.competencies == ["communication"]
    assert status.visited_at == visit.created_at


async def test_profile_summary_unvisited_booth_has_no_visited_at() -> None:
    booth = _booth(zone="F")
    service, _, _ = _build(latest=None, booths=[booth])

    status = (await service.get_profile_summary(uuid4())).booths[0]

    assert status.visited is False
    assert status.visited_at is None
    assert status.zone == "F"


async def test_profile_summary_no_booths_returns_empty_list() -> None:
    service, _, _ = _build(latest=None)
    summary = await service.get_profile_summary(uuid4())
    assert summary.booths == []


async def test_profile_summary_scores_competencies_of_visited_booth() -> None:
    """역량이 채워진 부스를 방문하면 그 역량만 1점, 나머지 9개는 0점이어야 한다.

    _list_booth_statuses가 booth_competencies를 booth.id로, visited_booth_ids를
    visit.booth_id로 맞추는 배선을 검증한다 — 여기서 키를 code로 잘못 쓰면 매핑이
    와도 모든 점수가 0으로 나와 빈 상태와 구분할 수 없어진다.
    """
    student_id = uuid4()
    booth = _booth("스피치ON", competencies=("communication",))
    service, _, _ = _build(
        latest=None,
        booths=[booth],
        visits=[_visit(student_id=student_id, booth_id=booth.id)],
    )

    summary = await service.get_profile_summary(student_id)

    scores = {s.key: s.score for s in summary.competencies}
    assert scores["communication"] == 1
    assert all(score == 0 for key, score in scores.items() if key != "communication")


def _persona_input() -> Persona:
    return Persona(
        name="숲을 지키는 드론전문가",
        tagline="자연과 기술을 잇는 사람",
        keywords=["자연", "기술"],
        fields=["환경", "로보틱스"],
    )


async def test_complete_survey_creates_completed_session_and_persona() -> None:
    service, _, db_pool = _build(latest=None)
    summary = await service.complete_survey(uuid4(), _persona_input())
    assert db_pool.entered is True
    assert service._sessions.created[0].status == "completed"  # type: ignore[attr-defined]
    assert service._personas.created[0].name == "숲을 지키는 드론전문가"  # type: ignore[attr-defined]
    assert summary.has_completed is True
    assert summary.persona is not None
    assert summary.persona.name == "숲을 지키는 드론전문가"
    assert summary.persona.keywords == ["자연", "기술"]


async def test_complete_survey_conflict_when_completed_and_retry_off() -> None:
    import pytest

    service, _, _ = _build(latest=_session("completed"), retry=False)
    with pytest.raises(ConflictError):
        await service.complete_survey(uuid4(), _persona_input())


async def test_complete_survey_allows_new_session_when_retry_on() -> None:
    service, _, _ = _build(latest=_session("completed"), retry=True)
    summary = await service.complete_survey(uuid4(), _persona_input())
    assert summary.has_completed is True
    assert len(service._sessions.created) == 1  # type: ignore[attr-defined]


async def test_complete_survey_without_persona_completes_without_persona() -> None:
    # 학생 흐름은 Q9가 마지막 — persona=None으로 완료하면 세션만 completed가 되고
    # persona는 저장하지 않는다(프로필은 '완료 · 카드 준비 중').
    service, _, db_pool = _build(latest=None)
    summary = await service.complete_survey(uuid4(), None)
    assert db_pool.entered is True
    assert service._sessions.created[0].status == "completed"  # type: ignore[attr-defined]
    assert service._personas.created == []  # type: ignore[attr-defined]
    assert summary.has_completed is True
    assert summary.persona is None
    assert summary.card is None


async def test_complete_survey_without_persona_conflict_when_completed_and_retry_off() -> None:
    import pytest

    service, _, _ = _build(latest=_session("completed"), retry=False)
    with pytest.raises(ConflictError):
        await service.complete_survey(uuid4(), None)


async def test_test_account_can_complete_survey_when_retry_off() -> None:
    """kind='test' 계정은 전역 retry_enabled가 꺼져 있어도 설문을 다시 완료할 수 있다."""
    student = replace(_student(), kind="test")
    service, _, _ = _build(latest=_session("completed"), retry=False, student=student)

    summary = await service.complete_survey(student.id, None)

    assert summary.has_completed is True


# --- submit_answer ---


async def test_submit_answer_creates_session_atomically_when_no_session_id() -> None:
    # session_id=None → 세션 생성 + 답변 삽입이 한 트랜잭션 안에서 일어나야 한다.
    service, _, db_pool = _build(latest=None)
    student = uuid4()

    sid = await service.submit_answer(student, None, "q1to6", {"a": 1})

    assert db_pool.entered is True
    created = service._sessions.created  # type: ignore[attr-defined]
    assert len(created) == 1
    assert created[0].status == "in_progress"
    assert sid == created[0].id
    # 답변은 방금 만든 그 세션에 삽입된다(세션 분산/유실 없음).
    assert service._sessions.inserted == [(sid, "q1to6", {"a": 1})]  # type: ignore[attr-defined]


async def test_submit_answer_uses_given_in_progress_session() -> None:
    # session_id가 주어지면 새 세션·트랜잭션 없이 그 세션에 저장한다.
    student = uuid4()
    existing = SessionRecord(
        id=uuid4(),
        student_id=student,
        status="in_progress",
        created_at=datetime.now(UTC),
        completed_at=None,
    )
    service, _, db_pool = _build(latest=existing)

    sid = await service.submit_answer(student, existing.id, "q7a", {"x": 1})

    assert sid == existing.id
    assert service._sessions.created == []  # type: ignore[attr-defined]
    assert db_pool.entered is False
    assert service._sessions.inserted == [(existing.id, "q7a", {"x": 1})]  # type: ignore[attr-defined]


async def test_submit_answer_not_found_when_session_missing() -> None:
    import pytest

    service, _, _ = _build(latest=None)
    with pytest.raises(NotFoundError):
        await service.submit_answer(uuid4(), uuid4(), "q7a", {})


async def test_submit_answer_forbidden_for_other_student() -> None:
    import pytest

    owner = uuid4()
    existing = SessionRecord(
        id=uuid4(),
        student_id=owner,
        status="in_progress",
        created_at=datetime.now(UTC),
        completed_at=None,
    )
    service, _, _ = _build(latest=existing)
    with pytest.raises(ForbiddenError):
        await service.submit_answer(uuid4(), existing.id, "q7a", {})  # 다른 학생


async def test_submit_answer_conflict_when_session_completed() -> None:
    import pytest

    student = uuid4()
    existing = SessionRecord(
        id=uuid4(),
        student_id=student,
        status="completed",
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
    )
    service, _, _ = _build(latest=existing)
    with pytest.raises(ConflictError):
        await service.submit_answer(student, existing.id, "q9", {})


async def test_submit_answer_uses_same_connection_for_create_and_insert() -> None:
    # 원자성의 핵심: 세션 생성과 답변 삽입이 '같은 트랜잭션 커넥션'으로 실행돼야 한다.
    # (insert를 트랜잭션 밖으로 옮기거나 conn 전달을 빼면 이 단언이 깨진다.)
    service, _, db_pool = _build(latest=None)
    await service.submit_answer(uuid4(), None, "q1to6", {"a": 1})
    repo = service._sessions  # type: ignore[attr-defined]
    assert repo.create_conn is db_pool.conn
    assert repo.insert_conn is db_pool.conn


async def test_submit_answer_propagates_insert_failure() -> None:
    # 삽입이 실패하면 예외가 전파돼야 한다(실제 asyncpg 트랜잭션이라면 세션 생성도 롤백).
    import pytest

    service, _, _ = _build(latest=None)

    async def _boom(*args: object, **kwargs: object) -> object:
        raise RuntimeError("insert failed")

    service._sessions.insert_answer = _boom  # type: ignore[attr-defined,assignment]
    with pytest.raises(RuntimeError):
        await service.submit_answer(uuid4(), None, "q1to6", {})


async def test_submit_answer_rejects_unknown_stage() -> None:
    # 저장 가능한 stage 검증은 비즈니스 규칙 — 라우터가 아니라 서비스가 막는다.
    import pytest

    service, _, db_pool = _build(latest=None)

    with pytest.raises(InvalidStageError) as exc:
        await service.submit_answer(uuid4(), None, "q99", {"a": 1})

    # 허용 목록을 details로 돌려줘 프론트가 원인을 알 수 있게 한다.
    assert exc.value.details["allowed"] == sorted(ANSWER_STAGES)
    # 세션이 만들어지기 전에 막혀야 한다(유령 세션 방지).
    assert db_pool.entered is False
    assert service._sessions.created == []  # type: ignore[attr-defined]


async def test_submit_answer_accepts_every_allowed_stage() -> None:
    for stage in sorted(ANSWER_STAGES):
        service, _, _ = _build(latest=None)
        sid = await service.submit_answer(uuid4(), None, stage, {})
        assert service._sessions.inserted == [(sid, stage, {})]  # type: ignore[attr-defined]
