"""현장 사진 상태를 기존 S3에 JSON으로 보관한다. 새 DB 테이블은 사용하지 않는다."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field, replace
from typing import Literal
from uuid import UUID, uuid4

from pydantic import TypeAdapter

from app.adapters.storage_client import StorageClient
from app.repositories.student_repo import StudentRepository

PhotoStatus = Literal["pending", "processing", "ready", "refused", "failed"]
PhotoChoice = Literal["ai", "character"]


@dataclass(frozen=True)
class OnsitePhoto:
    id: UUID
    student_id: UUID
    photo_key: str
    status: PhotoStatus
    image_key: str | None
    choice: PhotoChoice | None
    attempts: int = 1
    updated_at: float = field(default_factory=time.time)


_STATE = TypeAdapter(OnsitePhoto)


class OnsitePhotoRepository:
    def __init__(self, storage: StorageClient, students: StudentRepository) -> None:
        self._storage, self._students = storage, students

    @staticmethod
    def _path(student_id: UUID, photo_key: str) -> str:
        digest = hashlib.sha256(photo_key.encode()).hexdigest()
        return f"{student_id}/{digest}.json"

    async def _read(self, student_id: UUID, photo_key: str) -> tuple[OnsitePhoto, str] | None:
        path = self._path(student_id, photo_key)
        try:
            saved = await self._storage.read_onsite_state(path)
        except Exception as exc:
            # ListBucket 없는 계정은 없는 객체도 403이다. 부재로 단정하지 않고
            # 조건부로 비활성 상태를 생성한 뒤 실제 GetObject 권한을 다시 확인한다.
            response = getattr(exc, "response", {})
            if response.get("Error", {}).get("Code") not in ("AccessDenied", "403"):
                raise
            placeholder = OnsitePhoto(
                uuid4(), student_id, photo_key, "pending", None, None, attempts=0
            )
            await self._write(placeholder, None)
            saved = await self._storage.read_onsite_state(path)
        if saved is None:
            return None
        photo = _STATE.validate_json(saved[0])
        if photo.student_id != student_id or photo.photo_key != photo_key:
            raise ValueError("원본 사진과 생성 상태가 일치하지 않습니다.")
        return photo, saved[1]

    async def _write(self, photo: OnsitePhoto, etag: str | None) -> bool:
        return await self._storage.write_onsite_state(
            self._path(photo.student_id, photo.photo_key),
            json.dumps(asdict(photo), default=str).encode(),
            etag=etag,
        )

    async def get_current(self, student_id: UUID) -> OnsitePhoto | None:
        student = await self._students.get_by_id(student_id)
        if not student or not student.photo_key:
            return None
        saved = await self._read(student_id, student.photo_key)
        return saved[0] if saved and saved[0].status != "pending" else None

    async def claim(self, student_id: UUID, photo_key: str) -> OnsitePhoto | None:
        for _ in range(5):
            saved = await self._read(student_id, photo_key)
            photo = saved[0] if saved else None
            if photo:
                if photo.choice or photo.attempts >= 3 or photo.status in ("ready", "refused"):
                    return None
                if photo.status == "processing" and time.time() - photo.updated_at < 600:
                    return None
            job = OnsitePhoto(
                uuid4(),
                student_id,
                photo_key,
                "processing",
                None,
                None,
                attempts=photo.attempts + 1 if photo else 1,
            )
            if await self._write(job, saved[1] if saved else None):
                return job
        return None

    async def finish(self, job: OnsitePhoto, status: PhotoStatus, image_key: str | None) -> None:
        for _ in range(5):
            saved = await self._read(job.student_id, job.photo_key)
            if saved is None or saved[0].id != job.id or saved[0].status != "processing":
                return
            photo = replace(saved[0], status=status, image_key=image_key, updated_at=time.time())
            if await self._write(photo, saved[1]):
                return
        raise RuntimeError("사진 생성 상태를 저장하지 못했습니다.")

    async def choose(self, photo: OnsitePhoto, choice: PhotoChoice) -> bool:
        for _ in range(5):
            saved = await self._read(photo.student_id, photo.photo_key)
            if saved is None or saved[0].id != photo.id:
                return False
            current = saved[0]
            if current.choice:
                return current.choice == choice
            if choice == "ai" and (current.status != "ready" or not current.image_key):
                return False
            selected = replace(current, choice=choice, updated_at=time.time())
            if await self._write(selected, saved[1]):
                return True
        return False
