"""BoothVisitService 단위 테스트 — DB 없이 대역 리포지토리로 검증."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.repositories.booth_visit_repo import BoothVisitRecord
from app.repositories.session_repo import SessionRecord
from app.services.booth_visit_service import BoothVisitService
from tests.test_booth_service import FakeBoothRepo


class FakeBoothVisitRepo:
    """BoothVisitRepository 대역 — (student_id, booth_id) unique를 딕셔너리로 흉내낸다."""

    def __init__(self) -> None:
        self.rows: dict[tuple[UUID, UUID], BoothVisitRecord] = {}
        # create가 충돌을 보고했는데 뒤이은 조회는 비어 있는 경합을 재현하는 스위치.
        self.vanish_on_conflict = False

    async def create(self, *, student_id: UUID, booth_id: UUID) -> BoothVisitRecord | None:
        key = (student_id, booth_id)
        if key in self.rows:
            if self.vanish_on_conflict:
                del self.rows[key]  # 충돌 직후 다른 트랜잭션이 지운 상황
            return None
        record = BoothVisitRecord(
            id=uuid4(),
            student_id=student_id,
            booth_id=booth_id,
            created_at=datetime.now(UTC),
        )
        self.rows[key] = record
        return record

    async def get(self, *, student_id: UUID, booth_id: UUID) -> BoothVisitRecord | None:
        return self.rows.get((student_id, booth_id))


class FakeSessionRepo:
    """SessionRepository 대역 — 완료 세션 유무만 흉내낸다."""

    def __init__(self, *, completed: bool = True) -> None:
        self.completed = completed

    async def get_latest_completed_for_student(self, student_id: UUID) -> SessionRecord | None:
        if not self.completed:
            return None
        now = datetime.now(UTC)
        return SessionRecord(
            id=uuid4(),
            student_id=student_id,
            status="completed",
            created_at=now,
            completed_at=now,
        )


def _service(
    booths: FakeBoothRepo,
    visits: FakeBoothVisitRepo,
    *,
    completed: bool = True,
) -> BoothVisitService:
    # 세 Fake는 각 리포지토리의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    return BoothVisitService(
        booths=booths,  # type: ignore[arg-type]
        visits=visits,  # type: ignore[arg-type]
        sessions=FakeSessionRepo(completed=completed),  # type: ignore[arg-type]
    )


async def _seed_booth(
    repo: FakeBoothRepo, *, code: str = "YP7PHR", name: str = "드론 체험"
) -> None:
    await repo.create(code=code, name=name, description="드론을 직접 조종해보는 부스")


async def test_get_booth_returns_info_and_not_visited() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    res = await _service(booths, visits).get_booth(student_id=uuid4(), code="YP7PHR")

    assert res.code == "YP7PHR"
    assert res.name == "드론 체험"
    assert res.visited is False
    assert res.visited_at is None


async def test_get_booth_accepts_lowercase_code() -> None:
    """폰이 링크를 소문자로 넘기거나 학생이 손으로 입력해도 같은 부스를 찾는다."""
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    res = await _service(booths, visits).get_booth(student_id=uuid4(), code=" yp7phr ")

    assert res.code == "YP7PHR"


async def test_get_booth_unknown_code_raises_not_found() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    with pytest.raises(NotFoundError):
        await _service(booths, visits).get_booth(student_id=uuid4(), code="AAAAAA")


async def test_get_booth_requires_completed_session() -> None:
    """카드를 아직 안 받은 학생은 부스 정보 조회 단계에서 막힌다."""
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    with pytest.raises(ForbiddenError):
        await _service(booths, visits, completed=False).get_booth(student_id=uuid4(), code="YP7PHR")


async def test_check_in_records_visit() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)
    student_id = uuid4()

    res = await _service(booths, visits).check_in(student_id=student_id, code="YP7PHR")

    assert res.already_visited is False
    assert res.code == "YP7PHR"
    assert res.name == "드론 체험"
    assert len(visits.rows) == 1


async def test_check_in_twice_keeps_first_visit_time() -> None:
    """재방문은 에러가 아니다. 기록은 1건으로 유지되고 첫 방문 시각이 보존된다."""
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)
    service = _service(booths, visits)
    student_id = uuid4()

    first = await service.check_in(student_id=student_id, code="YP7PHR")
    second = await service.check_in(student_id=student_id, code="YP7PHR")

    assert first.already_visited is False
    assert second.already_visited is True
    assert second.visited_at == first.visited_at
    assert len(visits.rows) == 1


async def test_check_in_then_get_booth_reports_visited() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)
    service = _service(booths, visits)
    student_id = uuid4()

    recorded = await service.check_in(student_id=student_id, code="YP7PHR")
    res = await service.get_booth(student_id=student_id, code="YP7PHR")

    assert res.visited is True
    assert res.visited_at == recorded.visited_at


async def test_check_in_is_per_student() -> None:
    """한 학생의 방문이 다른 학생의 방문 여부에 영향을 주지 않는다."""
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)
    service = _service(booths, visits)
    other = uuid4()

    await service.check_in(student_id=uuid4(), code="YP7PHR")
    res = await service.get_booth(student_id=other, code="YP7PHR")

    assert res.visited is False


async def test_check_in_requires_completed_session() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    with pytest.raises(ForbiddenError):
        await _service(booths, visits, completed=False).check_in(student_id=uuid4(), code="YP7PHR")
    assert visits.rows == {}


async def test_check_in_unknown_code_raises_not_found() -> None:
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)

    with pytest.raises(NotFoundError):
        await _service(booths, visits).check_in(student_id=uuid4(), code="AAAAAA")


async def test_check_in_raises_conflict_when_record_vanishes_after_collision() -> None:
    """삽입은 충돌했는데 조회는 비는 경합에서 거짓 성공을 내보내지 않는다."""
    booths, visits = FakeBoothRepo(), FakeBoothVisitRepo()
    await _seed_booth(booths)
    service = _service(booths, visits)
    student_id = uuid4()
    await service.check_in(student_id=student_id, code="YP7PHR")
    visits.vanish_on_conflict = True

    with pytest.raises(ConflictError):
        await service.check_in(student_id=student_id, code="YP7PHR")
