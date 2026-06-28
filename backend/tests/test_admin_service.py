"""AdminService.list_students 단위 테스트 — fake 주입."""

from __future__ import annotations

from app.config import get_settings
from app.services.admin_service import AdminService
from tests.test_auth_service import FakeStorage, FakeStudentRepo

# pyproject: asyncio_mode = "auto" — async 테스트는 마커 없이 그대로 실행됨.


async def _seed(repo: FakeStudentRepo) -> None:
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    s2 = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=5,
        name="김영희", password="20110202", consent_privacy=True,
    )
    await repo.update_photo_key(s2.id, "uploads/photos/x/photo")


def _svc(repo: FakeStudentRepo, storage: FakeStorage) -> AdminService:
    return AdminService(students=repo, storage=storage, settings=get_settings())


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
