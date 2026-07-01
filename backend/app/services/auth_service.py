"""학생 등록·로그인·사진 첨부 비즈니스 로직.

- 비밀번호는 평문으로 저장·비교한다(정책상 해시하지 않음).
  주의: DB 덤프·로그 유출 시 비밀번호(=생년월일 PII)가 그대로 노출된다.
- 학생 세션 토큰은 TokenKind.STUDENT JWT(단기, app secret).
- 사진은 StorageClient.upload_photo로 올리고 photo_key만 DB에 저장.
  (실제 Storage 구현은 다른 팀원 작업 — 여기서는 인터페이스만 호출한다.)
"""

from __future__ import annotations

from datetime import timedelta
from typing import Protocol
from uuid import UUID

from app.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.student_repo import StudentRecord
from app.schemas.auth import LoginRequest, RegisterRequest


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
        consent_privacy: bool,
    ) -> StudentRecord: ...

    async def get_by_login_key(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
    ) -> StudentRecord | None: ...

    async def get_by_id(self, student_id: UUID) -> StudentRecord | None: ...

    async def update_photo_key(self, student_id: UUID, photo_key: str) -> None: ...


class PhotoStorage(Protocol):
    """AuthService가 의존하는 사진 업로드 인터페이스.

    StorageClient.upload_photo와 동일한 시그니처. 실제 구현은 다른 팀원 작업이라
    NotImplementedError가 날 수 있으며, 그 자리(seam)만 호출한다.
    """

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str: ...


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

    async def register_student(self, req: RegisterRequest) -> tuple[StudentRecord, str]:
        """학생 등록 → (레코드, 세션 토큰). 동의 누락은 ForbiddenError, 중복은 ConflictError."""
        if not req.consent_privacy:
            raise ForbiddenError("개인정보 수집·이용에 동의해야 가입할 수 있습니다.")

        existing = await self._students.get_by_login_key(
            school=req.school,
            grade=req.grade,
            class_no=req.class_no,
            student_no=req.student_no,
        )
        if existing is not None:
            raise ConflictError("이미 등록된 학생입니다.")

        student = await self._students.create(
            school=req.school,
            grade=req.grade,
            class_no=req.class_no,
            student_no=req.student_no,
            name=req.name,
            password=req.password,  # 평문 저장 (해시하지 않음)
            consent_privacy=req.consent_privacy,
        )
        return student, self._issue_token(student.id)

    async def login(self, req: LoginRequest) -> tuple[StudentRecord, str]:
        """식별 키 + 비밀번호 검증 → (레코드, 세션 토큰). 실패는 UnauthorizedError."""
        student = await self._students.get_by_login_key(
            school=req.school,
            grade=req.grade,
            class_no=req.class_no,
            student_no=req.student_no,
        )
        # 존재 여부를 노출하지 않도록 두 경우 모두 동일한 401. (평문 비교)
        if student is None or req.password != student.password:
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

        path = f"{student_id}/photo"
        photo_key = await self._storage.upload_photo(path, data, content_type=content_type)
        await self._students.update_photo_key(student_id, photo_key)
        return photo_key
