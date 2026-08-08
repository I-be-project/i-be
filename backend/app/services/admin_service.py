"""관리자 인증·조회·삭제 서비스."""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from uuid import UUID

from app.adapters.storage_client import StorageClient
from app.config import Settings
from app.core.errors import NotFoundError, UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.session_repo import (
    SessionContent,
    SessionRepository,
    StudentProgressRow,
)
from app.repositories.student_repo import ClassProgressRow, StudentRepository
from app.schemas.admin import (
    AdminAnswer,
    AdminBulkDeleteResponse,
    AdminClassProgress,
    AdminDeleteResponse,
    AdminSessionDetail,
    AdminStudentDetail,
    AdminStudentItem,
    AdminStudentList,
    AdminStudentPhoto,
    AdminStudentProgress,
    AdminTestPurgeResponse,
    AdminTestStudent,
    AdminTestToken,
)
from app.schemas.students import PersonaSummary

logger = logging.getLogger(__name__)


class AdminService:
    def __init__(
        self,
        *,
        students: StudentRepository,
        sessions: SessionRepository,
        storage: StorageClient,
        settings: Settings,
    ) -> None:
        self._students = students
        self._sessions = sessions
        self._storage = storage
        self._settings = settings

    def authenticate(self, username: str, password: str) -> str:
        """단일 관리자 계정 검증 후 admin 토큰 발급. 실패 시 UnauthorizedError."""
        # 타이밍 공격 완화를 위해 compare_digest 사용.
        ok_user = secrets.compare_digest(username, self._settings.admin_username)
        ok_pass = secrets.compare_digest(password, self._settings.admin_password)
        if not (ok_user and ok_pass):
            raise UnauthorizedError("아이디 또는 비밀번호가 올바르지 않습니다.")
        return create_token(
            kind=TokenKind.ADMIN,
            subject=username,
            ttl=timedelta(hours=self._settings.admin_token_ttl_hours),
            settings=self._settings,
        )

    # 사진/카드 presigned URL 유효시간 (1시간) — 관리자 조회 세션에 충분.
    _PHOTO_URL_TTL_SECONDS = 3600

    async def _signed_url(self, key: str | None) -> str | None:
        """key가 있으면 presigned URL 생성. 실패·부재 시 None(개별 graceful)."""
        if not key:
            return None
        try:
            return await self._storage.create_signed_url(
                key, ttl_seconds=self._PHOTO_URL_TTL_SECONDS
            )
        except Exception:
            return None

    async def _signed_urls(self, keys: list[str]) -> dict[str, str]:
        """여러 key를 한 번에 서명. 전체 실패 시 빈 dict(개별 실패는 어댑터가 흡수)."""
        if not keys:
            return {}
        try:
            return await self._storage.create_signed_urls(
                keys, ttl_seconds=self._PHOTO_URL_TTL_SECONDS
            )
        except Exception:
            return {}

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
        include_photo: bool = True,
        kind: str | None = None,
    ) -> AdminStudentList:
        """관리자 목록.

        include_photo 기본값이 true인 이유: 이 응답의 photo_url은 외부에 공개된
        계약이다(docs/2026-07-31-admin-api-usage.md, scripts/export_students.py).
        사진을 쓰지 않는 관리자 UI만 false로 호출해 서명 비용을 건너뛴다.

        kind를 생략하면 테스트 계정을 뺀 실제 참가자만 반환한다 — 테스트 계정은 실제
        데이터가 아니라 목록·통계를 오염시키기 때문이다. 관리자 화면의 '테스트 계정'
        탭이 kind='test'로 불러 따로 관리한다.
        """
        total, records = await self._students.list_students(
            q=q,
            school=school,
            grade=grade,
            class_no=class_no,
            limit=limit,
            offset=offset,
            sort=sort,
            kind=kind,
        )
        progress = await self._sessions.get_progress_for_students([r.id for r in records])
        photo_urls = (
            await self._signed_urls([r.photo_key for r in records if r.photo_key])
            if include_photo
            else {}
        )
        items: list[AdminStudentItem] = []
        for r in records:
            items.append(
                AdminStudentItem(
                    id=r.id,
                    school=r.school,
                    grade=r.grade,
                    class_no=r.class_no,
                    student_no=r.student_no,
                    name=r.name,
                    password=r.password,
                    gender=r.gender,
                    photo_url=photo_urls.get(r.photo_key) if r.photo_key else None,
                    has_photo=bool(r.photo_key),
                    kind=r.kind,
                    consent_privacy=r.consent_privacy,
                    created_at=r.created_at,
                    progress=_to_progress(progress.get(r.id)),
                )
            )
        return AdminStudentList(total=total, items=items)

    async def list_schools(self) -> list[str]:
        """가입 학생이 있는 학교 목록 — 관리자 목록 화면의 학교 필터용."""
        return await self._students.list_schools()

    async def get_class_progress(self, school: str) -> list[AdminClassProgress]:
        """학교의 반별 진행 현황 — 좌석표가 학생을 받기 전에 학년·반 목록을 그리는 데 쓴다."""
        rows: list[ClassProgressRow] = await self._students.get_class_progress(school)
        return [
            AdminClassProgress(
                grade=r.grade,
                class_no=r.class_no,
                total=r.total,
                completed=r.completed,
                in_progress=r.in_progress,
                not_started=r.not_started,
            )
            for r in rows
        ]

    async def get_student_detail(self, student_id: UUID) -> AdminStudentDetail:
        """학생 상세 — 기본 정보 + 모든 세션(최신순) 답변·페르소나·카드."""
        student = await self._students.get_by_id(student_id)
        if student is None:
            raise NotFoundError("학생을 찾을 수 없습니다.")

        contents = await self._sessions.list_sessions_with_content(student_id)
        # 카드 이미지와 학생 사진을 한 번의 클라이언트로 몰아서 서명한다.
        sign_keys = [c.card_image_key for c in contents if c.card_image_key]
        if student.photo_key:
            sign_keys.append(student.photo_key)
        signed = await self._signed_urls(sign_keys)

        sessions: list[AdminSessionDetail] = []
        for c in contents:
            sessions.append(
                AdminSessionDetail(
                    id=c.id,
                    status=c.status,
                    created_at=c.created_at,
                    completed_at=c.completed_at,
                    answers=[
                        AdminAnswer(stage=a.stage, payload=a.payload, created_at=a.created_at)
                        for a in c.answers
                    ],
                    persona=_to_persona_summary(c),
                    card_image_url=(signed.get(c.card_image_key) if c.card_image_key else None),
                )
            )

        return AdminStudentDetail(
            id=student.id,
            school=student.school,
            grade=student.grade,
            class_no=student.class_no,
            student_no=student.student_no,
            name=student.name,
            password=student.password,
            gender=student.gender,
            photo_url=signed.get(student.photo_key) if student.photo_key else None,
            consent_privacy=student.consent_privacy,
            created_at=student.created_at,
            sessions=sessions,
        )

    async def get_student_photo_url(self, student_id: UUID) -> AdminStudentPhoto:
        """학생 사진 URL 1건. 목록이 include_photo=false일 때 UI가 필요 시점에 부른다."""
        student = await self._students.get_by_id(student_id)
        if student is None:
            raise NotFoundError("학생을 찾을 수 없습니다.")
        return AdminStudentPhoto(photo_url=await self._signed_url(student.photo_key))

    async def _purge_student(self, student_id: UUID) -> tuple[bool, int]:
        """학생 1명 하드 삭제 + S3 정리. (삭제됨?, S3에서 지운 객체 수) 반환.

        관리자 명시 삭제이므로 사진도 폐기한다(자동 폐기 금지 정책의 예외).
        cascade로 카드 행이 사라지기 전에 카드 키를 먼저 수집한다.
        S3 정리는 best-effort(개별 실패해도 DB 삭제 자체는 성공).
        """
        card_keys = await self._sessions.list_card_image_keys(student_id)
        found, photo_key = await self._students.hard_delete(student_id)
        if not found:
            return False, 0
        removed = 0
        for key in [k for k in [photo_key, *card_keys] if k]:
            try:
                await self._storage.delete(key)
                removed += 1
            except Exception:
                logger.warning("S3 객체 삭제 실패(무시): %s", key, exc_info=True)
        return True, removed

    async def delete_student(self, student_id: UUID) -> AdminDeleteResponse:
        """학생을 하드 삭제 — DB(cascade) + S3 사진/카드 이미지까지 완전 제거."""
        found, removed = await self._purge_student(student_id)
        if not found:
            raise NotFoundError("학생을 찾을 수 없습니다.")
        return AdminDeleteResponse(student_id=student_id, removed_storage_objects=removed)

    async def delete_students(self, ids: list[UUID]) -> AdminBulkDeleteResponse:
        """여러 학생을 순차 삭제. 없는 id는 not_found로 모아 반환(중단하지 않음)."""
        deleted: list[UUID] = []
        not_found: list[UUID] = []
        removed_total = 0
        # 중복 id는 한 번만 처리.
        for student_id in dict.fromkeys(ids):
            found, removed = await self._purge_student(student_id)
            if found:
                deleted.append(student_id)
                removed_total += removed
            else:
                not_found.append(student_id)
        return AdminBulkDeleteResponse(
            deleted=deleted,
            not_found=not_found,
            removed_storage_objects=removed_total,
        )

    # 테스트 계정 비밀번호 길이(바이트) — 로그인에 쓰이지 않으므로 사람이 읽을 필요가 없다.
    _TEST_PASSWORD_BYTES = 24

    async def create_test_student(self, *, name: str, gender: str) -> AdminTestStudent:
        """관리자 전용 테스트 계정 발급.

        비밀번호는 랜덤으로 채우고 응답에 담지 않는다. 이 계정은 학생 로그인 화면으로
        진입할 수 없고(AuthService.login이 kind='guest'만 조회한다),
        issue_test_student_token으로 받은 토큰으로만 들어간다.
        """
        record = await self._students.create(
            school="",
            grade=0,
            class_no=0,
            student_no=0,
            name=name,
            password=secrets.token_urlsafe(self._TEST_PASSWORD_BYTES),
            gender=gender,
            consent_privacy=True,
            kind="test",
        )
        return AdminTestStudent(id=record.id, name=record.name, gender=gender)

    async def issue_test_student_token(self, student_id: UUID) -> AdminTestToken:
        """테스트 계정으로 학생 화면에 진입할 학생 세션 토큰 발급.

        대상이 kind='test'가 아니면 NotFoundError — 이 경로로 실제 학생의 토큰을
        발급받아 남의 계정에 들어가는 것을 막는다.
        """
        record = await self._students.get_by_id(student_id)
        if record is None or record.kind != "test":
            raise NotFoundError("테스트 계정을 찾을 수 없습니다.")
        token = create_token(
            kind=TokenKind.STUDENT,
            subject=student_id,
            ttl=timedelta(hours=self._settings.student_token_ttl_hours),
            settings=self._settings,
        )
        return AdminTestToken(student_id=student_id, student_token=token)

    async def purge_test_students(self) -> AdminTestPurgeResponse:
        """테스트 계정 전체를 하드 삭제 — DB cascade + S3 사진·카드 이미지 정리."""
        records = await self._students.list_by_kind("test")
        result = await self.delete_students([r.id for r in records])
        return AdminTestPurgeResponse(
            deleted=len(result.deleted),
            removed_storage_objects=result.removed_storage_objects,
        )


def _to_progress(row: StudentProgressRow | None) -> AdminStudentProgress:
    """진행도 행 → 응답 모델. 세션이 없으면 not_started 기본값."""
    if row is None:
        return AdminStudentProgress()
    # abandoned 등 알 수 없는 상태는 in_progress로 수렴.
    status = row.status if row.status in ("in_progress", "completed") else "in_progress"
    return AdminStudentProgress(
        status=status,
        stages_done=list(row.stages),
        has_persona=row.has_persona,
        has_card=row.has_card,
        last_activity_at=row.completed_at or row.created_at,
    )


def _to_persona_summary(content: SessionContent) -> PersonaSummary | None:
    if content.persona is None:
        return None
    p = content.persona
    return PersonaSummary(name=p.name, tagline=p.tagline, keywords=p.keywords, fields=p.fields)
