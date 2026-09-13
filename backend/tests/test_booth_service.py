"""BoothService 단위 테스트 — DB 없이 FakeBoothRepo로 검증."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg
import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.core.booth_code import BOOTH_CODE_ALPHABET, BOOTH_CODE_LENGTH
from app.core.errors import ConflictError, NotFoundError
from app.repositories.booth_repo import BoothRecord
from app.schemas.booths import BoothCreateRequest, BoothUpdateRequest
from app.services.booth_service import BoothService


class FakeBoothRepo:
    """BoothRepository 대역. collide_times만큼 create를 code 충돌로 실패시킨다."""

    def __init__(self, *, collide_times: int = 0) -> None:
        self.rows: dict[UUID, BoothRecord] = {}
        self.collide_times = collide_times
        self.attempted_codes: list[str] = []

    async def create(
        self, *, code: str, name: str, description: str | None, zone: str
    ) -> BoothRecord:
        self.attempted_codes.append(code)
        if self.collide_times > 0:
            self.collide_times -= 1
            raise asyncpg.UniqueViolationError("duplicate key value violates unique constraint")
        now = datetime.now(UTC)
        record = BoothRecord(
            id=uuid4(),
            code=code,
            name=name,
            description=description,
            zone=zone,
            competencies=(),
            created_at=now,
            updated_at=now,
        )
        self.rows[record.id] = record
        return record

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        return self.rows.get(booth_id)

    async def get_by_code(self, code: str) -> BoothRecord | None:
        return next((r for r in self.rows.values() if r.code == code), None)

    async def list_all(self) -> list[BoothRecord]:
        return sorted(self.rows.values(), key=lambda r: r.created_at)

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None, zone: str
    ) -> BoothRecord | None:
        current = self.rows.get(booth_id)
        if current is None:
            return None
        # 저장된 상태(self.rows)는 역량을 보존한다 — 실제 DB 행이 그렇다.
        stored = BoothRecord(
            id=current.id,
            code=current.code,
            name=name,
            description=description,
            zone=zone,
            competencies=current.competencies,
            created_at=current.created_at,
            updated_at=datetime.now(UTC),
        )
        self.rows[booth_id] = stored
        # 반환값은 진짜 BoothRepository.update()의 returning과 같이 competencies=()다 —
        # update 쿼리는 조인 쿼리가 아니라 역량 컬럼이 없다. 서비스가 이 빈 값을 곧이곧대로
        # 쓰면 안 된다는 걸 테스트가 잡아야 하므로 Fake도 진짜와 같은 결손을 재현한다.
        return replace(stored, competencies=())

    async def delete(self, booth_id: UUID) -> bool:
        return self.rows.pop(booth_id, None) is not None

    async def replace_competencies(self, booth_id: UUID, competencies: list[str]) -> None:
        current = self.rows.get(booth_id)
        if current is None:
            return
        self.rows[booth_id] = replace(current, competencies=tuple(competencies))


def _service(repo: FakeBoothRepo, *, origin: str = "https://i-be.vercel.app") -> BoothService:
    settings = Settings(frontend_origin=origin)
    # FakeBoothRepo는 BoothRepository의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    return BoothService(booths=repo, settings=settings)  # type: ignore[arg-type]


async def test_create_issues_code_and_qr_url() -> None:
    repo = FakeBoothRepo()
    res = await _service(repo).create(BoothCreateRequest(name="드론 체험"))

    assert len(res.code) == BOOTH_CODE_LENGTH
    assert set(res.code) <= set(BOOTH_CODE_ALPHABET)
    assert res.qr_url == f"https://i-be.vercel.app/b/{res.code}"
    assert res.name == "드론 체험"
    assert res.description is None


async def test_qr_url_strips_trailing_slash_from_origin() -> None:
    repo = FakeBoothRepo()
    res = await _service(repo, origin="https://i-be.vercel.app/").create(
        BoothCreateRequest(name="환경 체험")
    )

    assert res.qr_url == f"https://i-be.vercel.app/b/{res.code}"


async def test_create_retries_on_code_collision() -> None:
    """코드가 겹쳐도 사용자에게 실패를 보이지 않고 새 코드로 다시 시도한다."""
    repo = FakeBoothRepo(collide_times=2)
    res = await _service(repo).create(BoothCreateRequest(name="안전 체험"))

    assert len(repo.attempted_codes) == 3
    assert res.code == repo.attempted_codes[-1]


async def test_create_gives_up_after_max_attempts() -> None:
    repo = FakeBoothRepo(collide_times=99)

    with pytest.raises(ConflictError):
        await _service(repo).create(BoothCreateRequest(name="실패 부스"))


async def test_update_changes_name_and_keeps_code() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    created = await service.create(BoothCreateRequest(name="드론 체험", description="설명"))

    updated = await service.update(created.id, BoothUpdateRequest(name="드론 조종 체험"))

    assert updated.name == "드론 조종 체험"
    assert updated.description == "설명"
    assert updated.code == created.code


async def test_update_can_clear_description_with_explicit_null() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    created = await service.create(BoothCreateRequest(name="드론 체험", description="설명"))

    updated = await service.update(created.id, BoothUpdateRequest(description=None))

    assert updated.description is None
    assert updated.name == "드론 체험"


def test_update_rejects_explicit_null_name() -> None:
    """name에 명시적 null을 보내면 스키마 검증(422)에서 막는다 — 서비스까지 가지 않는다.

    name을 아예 보내지 않아 기존 이름이 유지되는 경로는
    test_update_can_clear_description_with_explicit_null에서 이미 검증한다.
    """
    with pytest.raises(ValidationError):
        BoothUpdateRequest(name=None)


async def test_update_missing_booth_raises_not_found() -> None:
    repo = FakeBoothRepo()

    with pytest.raises(NotFoundError):
        await _service(repo).update(uuid4(), BoothUpdateRequest(name="없음"))


async def test_delete_missing_booth_raises_not_found() -> None:
    repo = FakeBoothRepo()

    with pytest.raises(NotFoundError):
        await _service(repo).delete(uuid4())


async def test_list_all_returns_created_booths() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    await service.create(BoothCreateRequest(name="부스1"))
    await service.create(BoothCreateRequest(name="부스2"))

    items = await service.list_all()

    assert [b.name for b in items] == ["부스1", "부스2"]


@pytest.mark.anyio
async def test_create_with_zone() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(BoothCreateRequest(name="드론 시뮬레이션", zone="F"))

    assert created.zone == "F"


@pytest.mark.anyio
async def test_create_without_zone_is_blank() -> None:
    """기존 관리자 화면은 zone을 보내지 않는다. 그 요청이 그대로 동작해야 한다."""
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(BoothCreateRequest(name="이름만 있는 부스"))

    assert created.zone == ""


@pytest.mark.anyio
async def test_update_keeps_zone_when_not_sent() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(BoothCreateRequest(name="원래 이름", zone="L"))

    updated = await service.update(created.id, BoothUpdateRequest(name="바뀐 이름"))

    assert updated.name == "바뀐 이름"
    assert updated.zone == "L"


@pytest.mark.anyio
async def test_update_changes_zone_when_sent() -> None:
    """zone을 보내면 실제로 바뀌어야 한다 — repo에 zone을 안 넘겨도 통과하는

    "유지" 테스트만으로는 이 경로가 조용히 깨질 수 있다.
    """
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(BoothCreateRequest(name="원래 이름", zone="L"))

    updated = await service.update(created.id, BoothUpdateRequest(zone="Y"))

    assert updated.zone == "Y"


def test_invalid_zone_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", zone="Z")


@pytest.mark.anyio
async def test_create_with_competencies() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(
        BoothCreateRequest(
            name="드론 시뮬레이션",
            zone="F",
            competencies=["challenge", "analysis", "thinking"],
        )
    )

    assert sorted(created.competencies) == ["analysis", "challenge", "thinking"]


@pytest.mark.anyio
async def test_update_replaces_competencies() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(
        BoothCreateRequest(name="부스", zone="F", competencies=["challenge"])
    )

    updated = await service.update(
        created.id, BoothUpdateRequest(competencies=["empathy", "planning"])
    )

    assert sorted(updated.competencies) == ["empathy", "planning"]


@pytest.mark.anyio
async def test_update_keeps_competencies_when_not_sent() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(
        BoothCreateRequest(name="부스", zone="F", competencies=["challenge"])
    )

    updated = await service.update(created.id, BoothUpdateRequest(name="바뀐 이름"))

    assert updated.competencies == ["challenge"]


def test_unknown_competency_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", competencies=["없는역량"])


def test_duplicate_competency_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", competencies=["challenge", "challenge"])
