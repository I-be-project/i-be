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
from app.repositories.student_repo import ClassProgressRow, StudentRecord
from app.services.auth_service import AuthService


class FakeStudentRepo:
    """인메모리 학생 저장소 — StudentRepo Protocol 충족."""

    def __init__(self) -> None:
        self._by_key: dict[tuple[str, int, int, int], StudentRecord] = {}
        self._by_id: dict[UUID, StudentRecord] = {}
        # 집계 fake용 — 테스트가 학생별 최근 세션 상태를 직접 심는다.
        # None(키 없음)=세션 없음, "completed"=완료, 그 외=진행중.
        self.progress_status: dict[UUID, str] = {}

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
        gender: str,
        consent_privacy: bool,
        kind: str = "student",
    ) -> StudentRecord:
        if kind == "student":
            key = self._key(school, grade, class_no, student_no)
            if key in self._by_key:
                raise ConflictError("이미 등록된 학생입니다.")
        elif any(r.name == name and r.kind in ("guest", "test") for r in self._by_id.values()):
            raise ConflictError("이미 사용 중인 이름입니다.")

        record = StudentRecord(
            id=uuid4(),
            school=school,
            grade=grade,
            class_no=class_no,
            student_no=student_no,
            name=name,
            password=password,
            gender=gender,
            photo_key=None,
            consent_privacy=consent_privacy,
            kind=kind,
            created_at=datetime.now(UTC),
            deleted_at=None,
        )
        if kind == "student":
            self._by_key[self._key(school, grade, class_no, student_no)] = record
        self._by_id[record.id] = record
        return record

    async def get_by_login_key(
        self, *, school: str, grade: int, class_no: int, student_no: int
    ) -> StudentRecord | None:
        return self._by_key.get(self._key(school, grade, class_no, student_no))

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None:
        return self._by_id.get(student_id)

    async def get_by_name(self, name: str, *, kinds: tuple[str, ...]) -> StudentRecord | None:
        for record in self._by_id.values():
            if record.name == name and record.kind in kinds and record.deleted_at is None:
                return record
        return None

    async def list_by_kind(self, kind: str) -> list[StudentRecord]:
        return [r for r in self._by_id.values() if r.kind == kind and r.deleted_at is None]

    async def update_photo_key(self, student_id: UUID, photo_key: str) -> None:
        record = self._by_id[student_id]
        updated = replace(record, photo_key=photo_key)
        self._by_id[student_id] = updated
        self._by_key[self._key(record.school, record.grade, record.class_no, record.student_no)] = (
            updated
        )

    async def update_info(self, student_id: UUID, *, name: str | None, gender: str | None) -> None:
        record = self._by_id[student_id]
        # 실제 students_name_key와 같은 의미: 학교 없는 계정(guest/test)만 이름이
        # 유니크하다. 다른 계정이 이미 그 이름을 쓰고 있으면 ConflictError.
        if (
            name is not None
            and record.kind in ("guest", "test")
            and any(
                r.id != student_id and r.name == name and r.kind in ("guest", "test")
                for r in self._by_id.values()
            )
        ):
            raise ConflictError("이미 사용 중인 이름입니다.", details={"name": name})
        updated = replace(
            record,
            name=name if name is not None else record.name,
            gender=gender if gender is not None else record.gender,
        )
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
        sort: str | None = None,
        kind: str | None = None,
    ) -> tuple[int, list[StudentRecord]]:
        records = [r for r in self._by_id.values() if r.deleted_at is None]
        if kind is None:
            # 실제 SQL의 "kind <> 'test'" 조건과 같은 의미 — 테스트 계정은 기본 제외.
            records = [r for r in records if r.kind != "test"]
        else:
            # 실제 SQL의 "kind = $n" 조건과 같은 의미 — 그 종류만.
            records = [r for r in records if r.kind == kind]
        if q:
            records = [r for r in records if q in r.name]
        if school:
            records = [r for r in records if r.school == school]
        if grade is not None:
            records = [r for r in records if r.grade == grade]
        if class_no is not None:
            records = [r for r in records if r.class_no == class_no]
        if sort == "name_asc":
            records.sort(key=lambda r: (r.name, r.id))
        elif sort == "created_asc":
            records.sort(key=lambda r: (r.created_at, r.id))
        elif sort == "created_desc":
            records.sort(key=lambda r: (r.created_at, r.id), reverse=True)
        else:
            records.sort(key=lambda r: (r.school, r.grade, r.class_no, r.student_no))
        return len(records), records[offset : offset + limit]

    async def list_schools(self) -> list[str]:
        # 실제 SQL과 같이 학교 소속(kind == 'student')만 본다.
        schools = {
            r.school for r in self._by_id.values() if r.deleted_at is None and r.kind == "student"
        }
        return sorted(schools)

    async def get_class_progress(self, school: str) -> list[ClassProgressRow]:
        buckets: dict[tuple[int, int], dict[str, int]] = {}
        for r in self._by_id.values():
            if r.deleted_at is not None or r.school != school or r.kind != "student":
                continue
            b = buckets.setdefault(
                (r.grade, r.class_no),
                {"total": 0, "completed": 0, "in_progress": 0, "not_started": 0},
            )
            b["total"] += 1
            status = self.progress_status.get(r.id)
            if status is None:
                b["not_started"] += 1
            elif status == "completed":
                b["completed"] += 1
            else:
                b["in_progress"] += 1
        return [
            ClassProgressRow(
                grade=g,
                class_no=c,
                total=b["total"],
                completed=b["completed"],
                in_progress=b["in_progress"],
                not_started=b["not_started"],
            )
            for (g, c), b in sorted(buckets.items())
        ]

    async def hard_delete(self, student_id: UUID) -> tuple[bool, str | None]:
        record = self._by_id.pop(student_id, None)
        if record is None:
            return False, None
        self._by_key.pop(
            self._key(record.school, record.grade, record.class_no, record.student_no),
            None,
        )
        return True, record.photo_key


class FakeStorage:
    """업로드 호출을 기록하는 fake — PhotoStorage Protocol 충족."""

    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, str]] = []
        self.deleted: list[str] = []
        self.delete_failures: set[str] = set()
        self.batch_sign_calls = 0

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str:
        self.uploads.append((path, data, content_type))
        return f"photos/{path}"

    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        return f"https://signed.example/{key}?ttl={ttl_seconds}"

    async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
        self.batch_sign_calls += 1
        return {k: f"https://signed.example/{k}?ttl={ttl_seconds}" for k in dict.fromkeys(keys)}

    async def delete(self, key: str) -> None:
        if key in self.delete_failures:
            raise RuntimeError(f"S3 삭제 실패(테스트): {key}")
        self.deleted.append(key)


def _service() -> tuple[AuthService, FakeStudentRepo, FakeStorage]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    service = AuthService(students=repo, storage=storage, settings=get_settings())
    return service, repo, storage


def _register_kwargs(**overrides: object) -> dict[str, object]:
    """register_student 호출 인자. AuthService는 Request 모델이 아니라 값을 받는다."""
    base: dict[str, object] = {
        "school": "한마당고",
        "grade": 2,
        "class_no": 3,
        "student_no": 11,
        "name": "홍길동",
        "password": "20100101",
        "gender": "male",
        "consent_privacy": True,
    }
    base.update(overrides)
    return base


def _guest_kwargs(**overrides: object) -> dict[str, object]:
    """개인 참여자 등록 인자 — 학교 4개 필드를 전부 None으로 둔다."""
    return _register_kwargs(school=None, grade=None, class_no=None, student_no=None, **overrides)


async def test_register_stores_plaintext_password_and_issues_student_token() -> None:
    service, repo, _ = _service()

    student, token = await service.register_student(**_register_kwargs())

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
        await service.register_student(**_register_kwargs(consent_privacy=False))


async def test_register_duplicate_login_key_conflicts() -> None:
    service, _, _ = _service()
    await service.register_student(**_register_kwargs())
    with pytest.raises(ConflictError):
        await service.register_student(**_register_kwargs(name="다른이름", password="99999999"))


async def test_login_success_returns_token() -> None:
    service, _, _ = _service()
    await service.register_student(**_register_kwargs())

    student, token = await service.login(
        school="한마당고", grade=2, class_no=3, student_no=11, name=None, password="20100101"
    )
    payload = decode_token(token, expected_kind=TokenKind.STUDENT, settings=get_settings())
    assert payload["sub"] == str(student.id)


async def test_login_wrong_password_unauthorized() -> None:
    service, _, _ = _service()
    await service.register_student(**_register_kwargs())
    with pytest.raises(UnauthorizedError):
        await service.login(
            school="한마당고", grade=2, class_no=3, student_no=11, name=None, password="wrong"
        )


async def test_login_unknown_student_unauthorized() -> None:
    service, _, _ = _service()
    with pytest.raises(UnauthorizedError):
        await service.login(
            school="없는학교", grade=1, class_no=1, student_no=1, name=None, password="x"
        )


async def test_attach_photo_uploads_and_links_key() -> None:
    service, repo, storage = _service()
    student, _ = await service.register_student(**_register_kwargs())

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


async def test_update_profile_updates_name_and_gender() -> None:
    service, repo, _ = _service()
    student, _ = await service.register_student(**_register_kwargs())

    await service.update_profile(student.id, name="새이름", gender="female")

    updated = await repo.get_by_id(student.id)
    assert updated is not None
    assert updated.name == "새이름"
    assert updated.gender == "female"


async def test_update_profile_partial_update_keeps_other_field() -> None:
    service, repo, _ = _service()
    student, _ = await service.register_student(**_register_kwargs())

    await service.update_profile(student.id, name="새이름", gender=None)

    updated = await repo.get_by_id(student.id)
    assert updated is not None
    assert updated.name == "새이름"
    assert updated.gender == "male"  # 원래 값 유지


async def test_update_profile_unknown_student_not_found() -> None:
    service, _, _ = _service()
    with pytest.raises(NotFoundError):
        await service.update_profile(uuid4(), name="새이름", gender=None)


async def test_register_stores_student_kind() -> None:
    """학교 소속 가입은 kind='student'로 저장된다."""
    service, _repo, _ = _service()

    student, _token = await service.register_student(**_register_kwargs())

    assert student.kind == "student"


async def test_register_guest_without_school_fields() -> None:
    """학교 정보 없이 가입하면 kind='guest'로 저장되고 학교 필드는 비워진다."""
    service, _, _ = _service()

    student, token = await service.register_student(**_guest_kwargs())

    assert student.kind == "guest"
    assert student.school == ""
    assert (student.grade, student.class_no, student.student_no) == (0, 0, 0)
    payload = decode_token(token, expected_kind=TokenKind.STUDENT, settings=get_settings())
    assert payload["sub"] == str(student.id)


async def test_guest_login_by_name() -> None:
    """개인 참여자는 이름 + 비밀번호로 로그인한다."""
    service, _, _ = _service()
    created, _ = await service.register_student(**_guest_kwargs())

    student, _token = await service.login(
        school=None,
        grade=None,
        class_no=None,
        student_no=None,
        name="홍길동",
        password="20100101",
    )

    assert student.id == created.id


async def test_guest_duplicate_name_rejected() -> None:
    """같은 이름의 개인 참여자는 가입할 수 없다."""
    service, _, _ = _service()
    await service.register_student(**_guest_kwargs())

    with pytest.raises(ConflictError):
        await service.register_student(**_guest_kwargs(password="99999999"))


async def test_update_profile_guest_duplicate_name_conflicts() -> None:
    """개인 참여자가 이미 다른 계정이 쓰고 있는 이름으로 바꾸려 하면 ConflictError."""
    service, _, _ = _service()
    await service.register_student(**_guest_kwargs())  # 이름: 홍길동
    other, _ = await service.register_student(**_guest_kwargs(name="김민수"))

    with pytest.raises(ConflictError):
        await service.update_profile(other.id, name="홍길동", gender=None)


async def test_test_account_cannot_login_by_name() -> None:
    """테스트 계정은 이름·비밀번호가 맞아도 학생 로그인 화면으로 들어갈 수 없다."""
    service, repo, _ = _service()
    await repo.create(
        school="",
        grade=0,
        class_no=0,
        student_no=0,
        name="테스트1",
        password="20100101",
        gender="male",
        consent_privacy=True,
        kind="test",
    )

    with pytest.raises(UnauthorizedError):
        await service.login(
            school=None,
            grade=None,
            class_no=None,
            student_no=None,
            name="테스트1",
            password="20100101",
        )
