"""S3 상태 파일의 중복 생성 방지·재시작 복원·선택 보존 검증."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict, replace
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from app.repositories.onsite_photo_repo import OnsitePhotoRepository


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.version = 0

    async def read_onsite_state(self, path: str) -> tuple[bytes, str] | None:
        await asyncio.sleep(0)
        return self.objects.get(path)

    async def write_onsite_state(self, path: str, data: bytes, *, etag: str | None) -> bool:
        await asyncio.sleep(0)
        current = self.objects.get(path)
        if (etag is None and current is not None) or (
            etag is not None and (current is None or current[1] != etag)
        ):
            return False
        self.version += 1
        self.objects[path] = (data, str(self.version))
        return True


class Students:
    photo_key = "uploads/student/photo.jpg"

    async def get_by_id(self, student_id: object) -> Any:
        return SimpleNamespace(photo_key=self.photo_key)


def repo(storage: MemoryStorage, students: Students) -> OnsitePhotoRepository:
    # 외부 저장소와 기존 학생 조회만 대역으로 제공한다. 새 DB 테이블은 없다.
    return OnsitePhotoRepository(cast(Any, storage), cast(Any, students))


async def test_two_servers_only_claim_one_generation() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    one, two = repo(storage, students), repo(storage, students)
    results = await asyncio.gather(
        one.claim(student_id, students.photo_key), two.claim(student_id, students.photo_key)
    )
    assert sum(job is not None for job in results) == 1
    assert len(storage.objects) == 1


async def test_restart_restores_ready_image_and_selected_photo() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    first = repo(storage, students)
    job = await first.claim(student_id, students.photo_key)
    assert job
    await first.finish(job, "ready", "ai-images/future.png")
    ready = await first.get_current(student_id)
    assert ready
    assert await first.choose(ready, "ai")
    restored = await repo(storage, students).get_current(student_id)
    assert restored and restored.choice == "ai" and restored.image_key == "ai-images/future.png"
    assert await repo(storage, students).claim(student_id, students.photo_key) is None


async def test_generation_completion_keeps_character_choice() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    store = repo(storage, students)
    job = await store.claim(student_id, students.photo_key)
    assert job
    assert await store.choose(job, "character")
    await store.finish(job, "ready", "ai-images/future.png")
    ready = await store.get_current(student_id)
    assert ready and ready.choice == "character" and ready.status == "ready"
    assert not await store.choose(ready, "ai")


async def test_concurrent_choices_cannot_overwrite_each_other() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    one, two = repo(storage, students), repo(storage, students)
    job = await one.claim(student_id, students.photo_key)
    assert job
    await one.finish(job, "ready", "future.png")
    ready = await one.get_current(student_id)
    assert ready
    results = await asyncio.gather(one.choose(ready, "ai"), two.choose(ready, "character"))
    assert sorted(results) == [False, True]
    saved = await one.get_current(student_id)
    assert saved and saved.choice in ("ai", "character")
    assert await one.choose(saved, saved.choice)


async def test_ai_choice_requires_ready_image() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    store = repo(storage, students)
    job = await store.claim(student_id, students.photo_key)
    assert job
    assert not await store.choose(job, "ai")


async def test_old_original_photo_is_not_returned_after_photo_replacement() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    store = repo(storage, students)
    old = await store.claim(student_id, students.photo_key)
    assert old
    await store.finish(old, "ready", "old.png")
    students.photo_key = "uploads/student/new.jpg"
    assert await store.get_current(student_id) is None
    new = await store.claim(student_id, students.photo_key)
    assert new and new.id != old.id


async def test_stale_job_cannot_overwrite_replacement_job() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    store = repo(storage, students)
    old = await store.claim(student_id, students.photo_key)
    assert old
    path = next(iter(storage.objects))
    stale = replace(old, updated_at=time.time() - 601)
    storage.objects[path] = (json.dumps(asdict(stale), default=str).encode(), "stale-etag")
    new = await store.claim(student_id, students.photo_key)
    assert new and new.id != old.id and new.attempts == 2
    await store.finish(old, "ready", "old.png")
    current = await store.get_current(student_id)
    assert current and current.id == new.id and current.status == "processing"


async def test_failed_job_retries_are_bounded() -> None:
    storage, students, student_id = MemoryStorage(), Students(), uuid4()
    store = repo(storage, students)
    for attempt in range(1, 4):
        job = await store.claim(student_id, students.photo_key)
        assert job and job.attempts == attempt
        await store.finish(job, "failed", None)
    assert await store.claim(student_id, students.photo_key) is None


async def test_storage_permission_error_is_not_treated_as_missing_state() -> None:
    from unittest.mock import AsyncMock

    storage = AsyncMock()
    storage.read_onsite_state.side_effect = PermissionError("denied")
    store = OnsitePhotoRepository(storage, cast(Any, Students()))
    with pytest.raises(PermissionError):
        await store.claim(uuid4(), "original")
    storage.write_onsite_state.assert_not_awaited()


class MissingWithoutListBucket(MemoryStorage):
    async def read_onsite_state(self, path: str) -> tuple[bytes, str] | None:
        if path not in self.objects:
            error = RuntimeError("missing without ListBucket")
            error.response = {"Error": {"Code": "AccessDenied"}}
            raise error
        return await super().read_onsite_state(path)


async def test_missing_state_without_listbucket_can_be_claimed_without_permission_change() -> None:
    storage, students, student_id = MissingWithoutListBucket(), Students(), uuid4()
    store = repo(storage, students)
    assert await store.get_current(student_id) is None
    job = await store.claim(student_id, students.photo_key)
    assert job and job.status == "processing" and job.attempts == 1


async def test_bootstrap_cannot_hide_existing_getobject_permission_error() -> None:
    from unittest.mock import AsyncMock

    storage = AsyncMock()
    error = RuntimeError("GetObject denied")
    error.response = {"Error": {"Code": "AccessDenied"}}
    storage.read_onsite_state.side_effect = error
    storage.write_onsite_state.return_value = False
    store = OnsitePhotoRepository(storage, cast(Any, Students()))
    with pytest.raises(RuntimeError, match="GetObject denied"):
        await store.claim(uuid4(), "original")
    assert storage.read_onsite_state.await_count == 2


async def test_bootstrap_race_still_only_starts_one_job() -> None:
    storage, students, student_id = MissingWithoutListBucket(), Students(), uuid4()
    one, two = repo(storage, students), repo(storage, students)
    results = await asyncio.gather(
        one.claim(student_id, students.photo_key), two.claim(student_id, students.photo_key)
    )
    assert sum(job is not None for job in results) == 1
