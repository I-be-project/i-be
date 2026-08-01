"""AdminService 단위 테스트 — 목록·진행도·상세·삭제, fake 주입."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.config import get_settings
from app.core.errors import NotFoundError
from app.repositories.session_repo import (
    AnswerRecord,
    SessionContent,
    SessionPersona,
    StudentProgressRow,
)
from app.services.admin_service import AdminService
from tests.test_auth_service import FakeStorage, FakeStudentRepo

# pyproject: asyncio_mode = "auto" — async 테스트는 마커 없이 그대로 실행됨.


class FakeSessionRepo:
    """관리자 진행도/상세/삭제에 필요한 세션 조회만 흉내내는 인메모리 fake."""

    def __init__(self) -> None:
        self.progress: dict[UUID, StudentProgressRow] = {}
        self.contents: dict[UUID, list[SessionContent]] = {}
        self.card_keys: dict[UUID, list[str]] = {}

    async def get_progress_for_students(
        self, student_ids: list[UUID]
    ) -> dict[UUID, StudentProgressRow]:
        return {sid: self.progress[sid] for sid in student_ids if sid in self.progress}

    async def list_sessions_with_content(
        self, student_id: UUID
    ) -> list[SessionContent]:
        return self.contents.get(student_id, [])

    async def list_card_image_keys(self, student_id: UUID) -> list[str]:
        return self.card_keys.get(student_id, [])


async def _seed(repo: FakeStudentRepo) -> None:
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", gender="male", consent_privacy=True,
    )
    s2 = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=5,
        name="김영희", password="20110202", gender="female", consent_privacy=True,
    )
    await repo.update_photo_key(s2.id, "uploads/photos/x/photo")


def _svc(
    repo: FakeStudentRepo,
    storage: FakeStorage,
    sessions: FakeSessionRepo | None = None,
) -> AdminService:
    return AdminService(
        students=repo,
        sessions=sessions or FakeSessionRepo(),
        storage=storage,
        settings=get_settings(),
    )


async def test_list_returns_all_sorted() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    result = await _svc(repo, storage).list_students(
        q=None, school=None, grade=None, class_no=None, limit=50, offset=0
    )
    assert result.total == 2
    # 정렬: (학교,학년,반,번호) → 1학년 김영희가 먼저
    assert [i.name for i in result.items] == ["김영희", "홍길동"]


async def test_photo_url_present_only_when_photo_key() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    result = await _svc(repo, storage).list_students(
        q=None, school=None, grade=None, class_no=None, limit=50, offset=0
    )
    by_name = {i.name: i for i in result.items}
    assert by_name["김영희"].photo_url is not None
    assert by_name["홍길동"].photo_url is None


async def test_filter_by_grade() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    result = await _svc(repo, storage).list_students(
        q=None, school=None, grade=1, class_no=None, limit=50, offset=0
    )
    assert result.total == 1
    assert result.items[0].name == "김영희"


async def test_search_by_name() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    result = await _svc(repo, storage).list_students(
        q="홍", school=None, grade=None, class_no=None, limit=50, offset=0
    )
    assert [i.name for i in result.items] == ["홍길동"]


# --- 진행도 -------------------------------------------------------------------


async def test_progress_defaults_to_not_started() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    # 세션 정보가 전혀 없으면 모든 학생이 not_started.
    result = await _svc(repo, storage).list_students(
        q=None, school=None, grade=None, class_no=None, limit=50, offset=0
    )
    assert {i.progress.status for i in result.items} == {"not_started"}


async def test_progress_maps_in_progress_and_completed() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    sessions = FakeSessionRepo()
    by_name = {r.name: r for r in repo._by_id.values()}
    now = datetime.now(UTC)
    sessions.progress[by_name["홍길동"].id] = StudentProgressRow(
        student_id=by_name["홍길동"].id, status="in_progress", created_at=now,
        completed_at=None, has_persona=False, has_card=False, stages=["q1to6", "q7a"],
    )
    sessions.progress[by_name["김영희"].id] = StudentProgressRow(
        student_id=by_name["김영희"].id, status="completed", created_at=now,
        completed_at=now, has_persona=True, has_card=True, stages=["q1to6"],
    )
    result = await _svc(repo, storage, sessions).list_students(
        q=None, school=None, grade=None, class_no=None, limit=50, offset=0
    )
    prog = {i.name: i.progress for i in result.items}
    assert prog["홍길동"].status == "in_progress"
    assert prog["홍길동"].stages_done == ["q1to6", "q7a"]
    assert prog["김영희"].status == "completed"
    assert prog["김영희"].has_card is True


# --- 상세 ---------------------------------------------------------------------


async def test_student_detail_assembles_sessions() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    sessions = FakeSessionRepo()
    student = next(r for r in repo._by_id.values() if r.name == "홍길동")
    now = datetime.now(UTC)
    sessions.contents[student.id] = [
        SessionContent(
            id=uuid4(), status="completed", created_at=now, completed_at=now,
            answers=[AnswerRecord(uuid4(), uuid4(), "q1to6", {"riasec": "RIA"}, now)],
            persona=SessionPersona(
                name="탐험가", tagline="새로움을 좇는", keywords=["호기심"], fields=["과학"]
            ),
            card_image_key="cards/x/card",
        )
    ]
    detail = await _svc(repo, storage, sessions).get_student_detail(student.id)
    assert detail.name == "홍길동"
    assert len(detail.sessions) == 1
    s = detail.sessions[0]
    assert s.answers[0].stage == "q1to6"
    assert s.persona is not None and s.persona.name == "탐험가"
    assert s.card_image_url is not None  # presigned URL 생성됨


async def test_student_detail_missing_raises_not_found() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    try:
        await _svc(repo, storage).get_student_detail(uuid4())
    except NotFoundError:
        pass
    else:  # pragma: no cover
        raise AssertionError("없는 학생은 NotFoundError여야 한다")


# --- 삭제 ---------------------------------------------------------------------


async def test_delete_student_removes_row_and_storage() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    sessions = FakeSessionRepo()
    student = next(r for r in repo._by_id.values() if r.name == "김영희")  # 사진 있음
    sessions.card_keys[student.id] = ["cards/a/card", "cards/b/card"]

    res = await _svc(repo, storage, sessions).delete_student(student.id)

    assert res.student_id == student.id
    # 사진 1 + 카드 2 = 3개 S3 삭제.
    assert res.removed_storage_objects == 3
    assert set(storage.deleted) == {"uploads/photos/x/photo", "cards/a/card", "cards/b/card"}
    # DB 행 제거됨.
    assert await repo.get_by_id(student.id) is None


async def test_delete_student_missing_raises_not_found() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    try:
        await _svc(repo, storage).delete_student(uuid4())
    except NotFoundError:
        pass
    else:  # pragma: no cover
        raise AssertionError("없는 학생 삭제는 NotFoundError여야 한다")


async def test_bulk_delete_removes_found_and_reports_missing() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    sessions = FakeSessionRepo()
    younghee = next(r for r in repo._by_id.values() if r.name == "김영희")  # 사진 있음
    gildong = next(r for r in repo._by_id.values() if r.name == "홍길동")
    sessions.card_keys[younghee.id] = ["cards/a/card"]
    missing = uuid4()

    res = await _svc(repo, storage, sessions).delete_students(
        [younghee.id, gildong.id, missing]
    )

    assert set(res.deleted) == {younghee.id, gildong.id}
    assert res.not_found == [missing]
    # 김영희 사진 1 + 카드 1 = 2.
    assert res.removed_storage_objects == 2
    assert await repo.get_by_id(younghee.id) is None
    assert await repo.get_by_id(gildong.id) is None


async def test_delete_student_survives_storage_failure() -> None:
    repo, storage = FakeStudentRepo(), FakeStorage()
    await _seed(repo)
    sessions = FakeSessionRepo()
    student = next(r for r in repo._by_id.values() if r.name == "김영희")
    sessions.card_keys[student.id] = ["cards/a/card"]
    storage.delete_failures = {"uploads/photos/x/photo"}  # 사진 삭제만 실패

    res = await _svc(repo, storage, sessions).delete_student(student.id)

    # 사진 삭제 실패해도 DB 삭제는 성공, 카드 1건은 제거됨.
    assert res.removed_storage_objects == 1
    assert storage.deleted == ["cards/a/card"]
    assert await repo.get_by_id(student.id) is None


# --- include_photo 옵트아웃 -----------------------------------------------------


async def test_list_students_include_photo_false_skips_signing():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    await _seed(repo)
    svc = _svc(repo, storage)

    res = await svc.list_students(
        q=None,
        school=None,
        grade=None,
        class_no=None,
        limit=50,
        offset=0,
        include_photo=False,
    )

    # 서명을 한 번도 하지 않는다 — 이게 31초를 없애는 핵심이다.
    assert storage.batch_sign_calls == 0
    assert all(i.photo_url is None for i in res.items)
    # 사진 유무는 has_photo로 여전히 알 수 있다.
    assert {i.name: i.has_photo for i in res.items} == {"홍길동": False, "김영희": True}


async def test_list_students_include_photo_default_keeps_urls():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    await _seed(repo)
    svc = _svc(repo, storage)

    res = await svc.list_students(
        q=None, school=None, grade=None, class_no=None, limit=50, offset=0
    )

    # 기본값은 true — 외부 API 계약이 유지되어야 한다.
    by_name = {i.name: i for i in res.items}
    assert by_name["김영희"].photo_url is not None
    assert by_name["김영희"].has_photo is True
    assert by_name["홍길동"].photo_url is None
    assert by_name["홍길동"].has_photo is False


# --- 반별 진행 현황 집계 ---------------------------------------------------------


async def test_get_class_progress_buckets_by_grade_and_class():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    a = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=1,
        name="가",
        password="p",
        gender="male",
        consent_privacy=True,
    )
    b = await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=2,
        name="나",
        password="p",
        gender="female",
        consent_privacy=True,
    )
    await repo.create(
        school="한마당고",
        grade=1,
        class_no=1,
        student_no=3,
        name="다",
        password="p",
        gender="male",
        consent_privacy=True,
    )
    await repo.create(
        school="한마당고",
        grade=2,
        class_no=5,
        student_no=1,
        name="라",
        password="p",
        gender="female",
        consent_privacy=True,
    )
    await repo.create(
        school="다른고",
        grade=1,
        class_no=1,
        student_no=1,
        name="마",
        password="p",
        gender="male",
        consent_privacy=True,
    )
    repo.progress_status[a.id] = "completed"
    repo.progress_status[b.id] = "in_progress"
    svc = _svc(repo, storage)

    rows = await svc.get_class_progress("한마당고")

    # 다른 학교는 섞이지 않고, (학년, 반) 오름차순으로 온다.
    assert [(r.grade, r.class_no) for r in rows] == [(1, 1), (2, 5)]
    assert rows[0].total == 3
    assert rows[0].completed == 1
    assert rows[0].in_progress == 1
    assert rows[0].not_started == 1
    assert rows[1].total == 1
    assert rows[1].not_started == 1


async def test_get_class_progress_counts_abandoned_as_in_progress():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    a = await repo.create(
        school="한마당고",
        grade=3,
        class_no=2,
        student_no=1,
        name="가",
        password="p",
        gender="male",
        consent_privacy=True,
    )
    repo.progress_status[a.id] = "abandoned"
    svc = _svc(repo, storage)

    rows = await svc.get_class_progress("한마당고")

    # _to_progress와 같은 규칙 — 알 수 없는 상태는 진행중으로 수렴한다.
    assert rows[0].in_progress == 1
    assert rows[0].completed == 0
