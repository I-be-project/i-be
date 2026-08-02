"""BoothService 단위 테스트 — DB 없이 FakeBoothRepo로 검증."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg
import pytest

from app.config import Settings
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

    async def create(self, *, code: str, name: str, description: str | None) -> BoothRecord:
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
            created_at=now,
            updated_at=now,
        )
        self.rows[record.id] = record
        return record

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        return self.rows.get(booth_id)

    async def list_all(self) -> list[BoothRecord]:
        return sorted(self.rows.values(), key=lambda r: r.created_at)

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None
    ) -> BoothRecord | None:
        current = self.rows.get(booth_id)
        if current is None:
            return None
        updated = BoothRecord(
            id=current.id,
            code=current.code,
            name=name,
            description=description,
            created_at=current.created_at,
            updated_at=datetime.now(UTC),
        )
        self.rows[booth_id] = updated
        return updated

    async def delete(self, booth_id: UUID) -> bool:
        return self.rows.pop(booth_id, None) is not None


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
