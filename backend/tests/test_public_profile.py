from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from app.config import get_settings
from app.core.errors import NotFoundError
from app.core.profile_share import profile_share_code, read_profile_share_code
from app.deps import get_session_service
from app.main import create_app
from app.repositories.card_repo import CardRecord
from tests.test_session_service import _booth, _build, _persona, _session, _student, _visit


async def test_admin_can_open_test_profile_without_issuing_student_token():
    from tests.test_admin_router import _admin_token
    from tests.test_admin_router import _build as build_admin

    app, _, _, _ = build_admin()
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        created = await client.post(
            "/api/admin/students/test",
            headers=headers,
            json={"name": "공유 테스트", "gender": "male"},
        )
        assert created.status_code == 201, created.text
        student_id = created.json()["id"]
        url = f"/api/admin/students/test/{student_id}/profile"
        assert (await client.get(url)).status_code == 401
        response = await client.get(url, headers=headers)
        assert response.status_code == 200
        assert set(response.json()) == {"path"}
        code = response.json()["path"].split("/")[2]
        assert str(read_profile_share_code(code, get_settings())) == student_id
        assert (
            await client.get(f"/api/admin/students/test/{uuid4()}/profile", headers=headers)
        ).status_code == 404


def test_code_is_stable_scoped_and_tamper_resistant():
    settings = get_settings()
    student_id = uuid4()
    code = profile_share_code(student_id, settings)
    assert read_profile_share_code(code, settings) == student_id
    assert code == profile_share_code(student_id, settings)
    assert profile_share_code(uuid4(), settings) != code
    for invalid in [str(student_id), "bad", code[:-1] + ("A" if code[-1] != "A" else "B")]:
        with pytest.raises(NotFoundError):
            read_profile_share_code(invalid, settings)


@pytest.mark.parametrize("kind", ["student", "guest", "test"])
async def test_only_test_accounts_receive_share_path(kind):
    student = replace(_student(), kind=kind)
    service, _, _ = _build(latest=None, student=student)
    profile = await service.get_profile_summary(student.id)
    if kind == "test":
        assert profile.share_path == f"/p/{profile_share_code(student.id, get_settings())}/home"
    else:
        assert profile.share_path is None


async def test_anonymous_public_profile_includes_card_visits_and_scores_only():
    student = replace(_student(), kind="test", photo_key="private/student-photo.png")
    persona = _persona()
    booth = _booth(competencies=("creativity",))
    card = CardRecord(
        id=uuid4(),
        persona_id=persona.id,
        card_image_key="cards/public.png",
        created_at=datetime.now(UTC),
    )
    service, storage, _ = _build(
        latest=_session("completed"),
        student=student,
        persona=persona,
        card=card,
        booths=[booth],
        visits=[_visit(student_id=student.id, booth_id=booth.id)],
    )
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    code = profile_share_code(student.id, get_settings())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(f"/api/students/shared/{code}")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert set(body) == {"display_name", "persona", "card", "booths", "competencies"}
        assert body["persona"]["name"] == persona.name
        assert "cards/public.png" in body["card"]["card_image_url"]
        assert body["booths"][0]["visited"] is True
        assert (
            next(score for score in body["competencies"] if score["key"] == "creativity")["score"]
            == 1
        )
        assert body["display_name"] == student.name
        assert student.school not in response.text
        assert "private/student-photo" not in response.text
        assert all(key != student.photo_key for key, _ in storage.calls)
        # 공유 코드는 학생 로그인 토큰으로 사용할 수 없다.
        denied = await client.get("/api/students/me", headers={"Authorization": f"Bearer {code}"})
        assert denied.status_code == 401
        assert (await client.post(f"/api/students/shared/{code}")).status_code == 405


@pytest.mark.parametrize("kind,deleted", [("student", False), ("guest", False), ("test", True)])
async def test_valid_signature_does_not_publish_regular_or_deleted_accounts(kind, deleted):
    student = replace(_student(), kind=kind, deleted_at=datetime.now(UTC) if deleted else None)
    service, _, _ = _build(latest=None, student=student)
    with pytest.raises(NotFoundError):
        await service.get_public_profile(profile_share_code(student.id, get_settings()))


async def test_invalid_link_and_deleted_record_return_404_without_login():
    service, _, _ = _build(latest=None)
    service._students.student = None
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for code in ["invalid", profile_share_code(uuid4(), get_settings())]:
            response = await client.get(f"/api/students/shared/{code}")
            assert response.status_code == 404
