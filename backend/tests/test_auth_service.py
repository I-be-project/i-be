"""AuthService 단위 테스트 — fake 저장소/스토리지 주입.

실제 DB·Storage 없이 등록/로그인/사진첨부 흐름과 예외를 검증한다.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import TokenKind, decode_token
from app.repositories.student_repo import StudentRecord
from app.schemas.auth import LoginRequest, RegisterRequest
from app.services.auth_service import AuthService


class FakeStudentRepo:
    """인메모리 학생 저장소 — StudentRepo Protocol 충족."""

    def __init__(self) -> None:
        self._by_key: dict[tuple[str, int, int, int], StudentRecord] = {}
        self._by_id: dict[UUID, StudentRecord] = {}

    @staticmethod
    def _key(school: str, grade: int, class_no: int, student_no: int) -> tuple[str, int, int, int]:
        return (school, grade, class_no, student_no)

    async def create(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
        name: str,
        password: str,
        consent_privacy: bool,
    ) -> StudentRecord:
        key = self._key(school, grade, class_no, student_no)
        if key in self._by_key:
            raise ConflictError("이미 등록된 학생입니다.")
        record = StudentRecord(
            id=uuid4(),
            school=school,
            grade=grade,
            class_no=class_no,
            student_no=student_no,
            name=name,
            password=password,
            photo_key=None,
            consent_privacy=consent_privacy,
            created_at=datetime.now(UTC),
            deleted_at=None,
        )
        self._by_key[key] = record
        self._by_id[record.id] = record
        return record

    async def get_by_login_key(
        self, *, school: str, grade: int, class_no: int, student_no: int
    ) -> StudentRecord | None:
        return self._by_key.get(self._key(school, grade, class_no, student_no))

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None:
        return self._by_id.get(student_id)

    async def update_photo_key(self, student_id: UUID, photo_key: str) -> None:
        record = self._by_id[student_id]
        updated = replace(record, photo_key=photo_key)
        self._by_id[student_id] = updated
        self._by_key[self._key(record.school, record.grade, record.class_no, record.student_no)] = (
            updated
        )

    async def list_students(
        self,
        *,
        q: str | None,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        limit: int,
        offset: int,
    ) -> tuple[int, list[StudentRecord]]:
        records = [r for r in self._by_id.values() if r.deleted_at is None]
        if q:
            records = [r for r in records if q in r.name]
        if school:
            records = [r for r in records if r.school == school]
        if grade is not None:
            records = [r for r in records if r.grade == grade]
        if class_no is not None:
            records = [r for r in records if r.class_no == class_no]
        records.sort(key=lambda r: (r.school, r.grade, r.class_no, r.student_no))
        return len(records), records[offset : offset + limit]


class FakeStorage:
    """업로드 호출을 기록하는 fake — PhotoStorage Protocol 충족."""

    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, str]] = []

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str:
        self.uploads.append((path, data, content_type))
        return f"photos/{path}"

    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        return f"https://signed.example/{key}?ttl={ttl_seconds}"


def _service() -> tuple[AuthService, FakeStudentRepo, FakeStorage]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    service = AuthService(students=repo, storage=storage, settings=get_settings())
    return service, repo, storage


def _register_req(**overrides: object) -> RegisterRequest:
    base: dict[str, object] = {
        "school": "한마당고",
        "grade": 2,
        "class_no": 3,
        "student_no": 11,
        "name": "홍길동",
        "password": "20100101",
        "consent_privacy": True,
    }
    base.update(overrides)
    return RegisterRequest(**base)  # type: ignore[arg-type]


async def test_register_stores_plaintext_password_and_issues_student_token() -> None:
    service, repo, _ = _service()

    student, token = await service.register_student(_register_req())

    # 비밀번호는 평문 그대로 저장(해시하지 않음)
    assert student.password == "20100101"
    # 토큰은 학생 종류로 디코드되고 sub == student.id
    payload = decode_token(token, expected_kind=TokenKind.STUDENT, settings=get_settings())
    assert payload["sub"] == str(student.id)
    # 저장소에 들어갔는지
    assert await repo.get_by_id(student.id) is not None


async def test_register_rejected_without_privacy_consent() -> None:
    service, _, _ = _service()
    with pytest.raises(ForbiddenError):
        await service.register_student(_register_req(consent_privacy=False))


async def test_register_duplicate_login_key_conflicts() -> None:
    service, _, _ = _service()
    await service.register_student(_register_req())
    with pytest.raises(ConflictError):
        await service.register_student(_register_req(name="다른이름", password="99999999"))


async def test_login_success_returns_token() -> None:
    service, _, _ = _service()
    await service.register_student(_register_req())

    student, token = await service.login(
        LoginRequest(school="한마당고", grade=2, class_no=3, student_no=11, password="20100101")
    )
    payload = decode_token(token, expected_kind=TokenKind.STUDENT, settings=get_settings())
    assert payload["sub"] == str(student.id)


async def test_login_wrong_password_unauthorized() -> None:
    service, _, _ = _service()
    await service.register_student(_register_req())
    with pytest.raises(UnauthorizedError):
        await service.login(
            LoginRequest(school="한마당고", grade=2, class_no=3, student_no=11, password="wrong")
        )


async def test_login_unknown_student_unauthorized() -> None:
    service, _, _ = _service()
    with pytest.raises(UnauthorizedError):
        await service.login(
            LoginRequest(school="없는학교", grade=1, class_no=1, student_no=1, password="x")
        )


async def test_attach_photo_uploads_and_links_key() -> None:
    service, repo, storage = _service()
    student, _ = await service.register_student(_register_req())

    photo_key = await service.attach_photo(student.id, b"jpegbytes", content_type="image/jpeg")

    assert storage.uploads == [(f"{student.id}/photo", b"jpegbytes", "image/jpeg")]
    assert photo_key == f"photos/{student.id}/photo"
    refreshed = await repo.get_by_id(student.id)
    assert refreshed is not None and refreshed.photo_key == photo_key


async def test_attach_photo_unknown_student_not_found() -> None:
    service, _, storage = _service()
    with pytest.raises(NotFoundError):
        await service.attach_photo(uuid4(), b"x", content_type="image/png")
    assert storage.uploads == []
