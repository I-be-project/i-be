"""학생 등록·로그인·사진 첨부 비즈니스 로직.

- 비밀번호는 평문으로 저장·비교한다(정책상 해시하지 않음).
  주의: DB 덤프·로그 유출 시 비밀번호(=생년월일 PII)가 그대로 노출된다.
- 학생 세션 토큰은 TokenKind.STUDENT JWT(단기, app secret).
- 사진은 StorageClient.upload_photo로 올리고 photo_key만 DB에 저장.
  (실제 Storage 구현은 다른 팀원 작업 — 여기서는 인터페이스만 호출한다.)
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Protocol
from uuid import UUID, uuid4

from app.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.student_repo import StudentRecord

logger = logging.getLogger(__name__)


class StudentRepo(Protocol):
    """AuthService가 의존하는 학생 저장소 인터페이스(구조적 타이핑).

    실제 구현은 StudentRepository, 테스트는 fake가 이 시그니처를 만족한다.
    """

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
        kind: str = ...,
        birth_date: str | None = ...,
    ) -> StudentRecord: ...

    async def get_by_login_key(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
        name: str,
    ) -> StudentRecord | None: ...

    async def get_by_name(self, name: str, *, kinds: tuple[str, ...]) -> StudentRecord | None: ...

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None: ...

    async def update_photo_key(self, student_id: UUID, photo_key: str) -> None: ...

    async def update_info(
        self, student_id: UUID, *, name: str | None, gender: str | None
    ) -> None: ...


class PhotoStorage(Protocol):
    """AuthService가 의존하는 사진 업로드 인터페이스.

    StorageClient.upload_photo와 동일한 시그니처. 실제 구현은 다른 팀원 작업이라
    NotImplementedError가 날 수 있으며, 그 자리(seam)만 호출한다.
    """

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str: ...
    async def delete(self, key: str) -> None: ...


# 학교 없는 계정(guest·test)의 학교 식별 필드 고정값.
# 컬럼이 not null이라 값은 채우되 의미를 비운다. 유니크는 이름으로 잡는다.
GUEST_SCHOOL = ""
GUEST_NUMBER = 0


class AuthService:
    """등록 + 동의 검증 + 로그인 + 사진 업로드 + 학생 세션 토큰 발급."""

    def __init__(
        self,
        *,
        students: StudentRepo,
        storage: PhotoStorage,
        settings: Settings,
    ) -> None:
        self._students = students
        self._storage = storage
        self._settings = settings

    def _issue_token(self, student_id: UUID) -> str:
        return create_token(
            kind=TokenKind.STUDENT,
            subject=student_id,
            ttl=timedelta(hours=self._settings.student_token_ttl_hours),
            settings=self._settings,
        )

    async def register_student(
        self,
        *,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        student_no: int | None,
        name: str,
        password: str,
        gender: str,
        consent_privacy: bool,
        birth_date: str | None = None,
    ) -> tuple[StudentRecord, str]:
        """학생·개인 참여자 등록 → (레코드, 세션 토큰).

        학교 정보가 없으면 개인 참여자(kind='guest')로 만든다. 학교 필드 조합 검증과
        개인 참여자의 생년월일 필수 여부는 요청 스키마(RegisterRequest)가 이미
        마쳤으므로 여기서는 school의 유무만 본다. 동의 누락은 ForbiddenError,
        중복은 ConflictError.
        """
        if not consent_privacy:
            raise ForbiddenError("개인정보 수집·이용에 동의해야 가입할 수 있습니다.")

        if school is None:
            # 이름 중복은 students_name_key가 잡지만, 저장소에 닿기 전에 같은 메시지로 거른다.
            if await self._students.get_by_name(name, kinds=("guest", "test")) is not None:
                raise ConflictError("이미 사용 중인 이름입니다.")
            student = await self._students.create(
                school=GUEST_SCHOOL,
                grade=GUEST_NUMBER,
                class_no=GUEST_NUMBER,
                student_no=GUEST_NUMBER,
                name=name,
                password=password,
                gender=gender,
                consent_privacy=consent_privacy,
                kind="guest",
                birth_date=birth_date,
            )
            return student, self._issue_token(student.id)

        # 스키마 validator가 학교 4개 필드를 모두-있거나-모두-없거나로 강제하므로,
        # school이 있으면 나머지 셋도 반드시 있다 — mypy strict용 타입 좁히기.
        assert grade is not None and class_no is not None and student_no is not None
        # 반·번호 중복은 허용한다 — 이름까지 같을 때만 같은 사람으로 본다.
        existing = await self._students.get_by_login_key(
            school=school, grade=grade, class_no=class_no, student_no=student_no, name=name
        )
        if existing is not None:
            raise ConflictError("같은 반·번호에 같은 이름으로 이미 등록되어 있습니다.")

        student = await self._students.create(
            school=school,
            grade=grade,
            class_no=class_no,
            student_no=student_no,
            name=name,
            password=password,  # 평문 저장 (해시하지 않음)
            gender=gender,
            consent_privacy=consent_privacy,
            kind="student",
        )
        return student, self._issue_token(student.id)

    async def login(
        self,
        *,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        student_no: int | None,
        name: str,
        password: str,
    ) -> tuple[StudentRecord, str]:
        """식별 키 + 이름 + 비밀번호 검증 → (레코드, 세션 토큰). 실패는 UnauthorizedError.

        이름은 두 경로 모두 필수다. 학교 소속은 (학교,학년,반,번호,이름)이 식별 키고,
        개인 참여자는 이름만으로 조회한다.

        개인 참여자 조회는 kind='guest'만 본다. 테스트 계정(kind='test')은 관리자
        토큰으로만 진입하며, 이름·비밀번호를 알아도 이 경로로는 들어올 수 없다.
        """
        if school is None:
            student = await self._students.get_by_name(name, kinds=("guest",))
        else:
            # 스키마 validator가 학교 4개 필드를 모두-있거나-모두-없거나로 강제하므로,
            # school이 있으면 나머지 셋도 반드시 있다 — mypy strict용 타입 좁히기.
            assert grade is not None and class_no is not None and student_no is not None
            student = await self._students.get_by_login_key(
                school=school, grade=grade, class_no=class_no, student_no=student_no, name=name
            )

        # 존재 여부를 노출하지 않도록 두 경우 모두 동일한 401. (평문 비교)
        if student is None or password != student.password:
            raise UnauthorizedError("학생 정보 또는 비밀번호가 올바르지 않습니다.")

        return student, self._issue_token(student.id)

    def refresh_token(self, student_id: UUID) -> str:
        """검증된 학생 토큰을 새 만료시간으로 재발급."""
        return self._issue_token(student_id)

    async def attach_photo(
        self,
        student_id: UUID,
        data: bytes,
        *,
        content_type: str,
    ) -> str:
        """사진을 Storage에 올리고 photo_key를 학생에 연결 → photo_key 반환.

        실제 업로드는 StorageClient.upload_photo 호출 자리만 둔다(구현은 타 팀원).
        """
        student = await self._students.get_by_id(student_id)
        if student is None:
            raise NotFoundError("학생을 찾을 수 없습니다.")

        # 수정은 새 키로 올린 뒤 DB를 바꾼다. 캐시 재사용과 저장 실패 시 원본 덮어쓰기를 방지한다.
        path = f"{student_id}/photo-{uuid4()}" if student.photo_key else f"{student_id}/photo"
        photo_key = await self._storage.upload_photo(path, data, content_type=content_type)
        try:
            await self._students.update_photo_key(student_id, photo_key)
        except Exception:
            try:
                await self._storage.delete(photo_key)
            except Exception:
                logger.warning("저장 실패한 새 사진 정리 실패", exc_info=True)
            raise
        if student.photo_key and student.photo_key != photo_key:
            try:
                await self._storage.delete(student.photo_key)
            except Exception:
                logger.warning("교체한 이전 사진 정리 실패", exc_info=True)
        return photo_key

    async def update_profile(
        self,
        student_id: UUID,
        *,
        name: str | None,
        gender: str | None,
    ) -> None:
        """이름/성별 부분 수정. 대상이 없으면 NotFoundError."""
        student = await self._students.get_by_id(student_id)
        if student is None:
            raise NotFoundError("학생을 찾을 수 없습니다.")

        await self._students.update_info(student_id, name=name, gender=gender)
