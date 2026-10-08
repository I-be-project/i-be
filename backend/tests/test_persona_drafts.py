"""페르소나·카드 초안 — 문구 분리, 카드 합성, 이미지 실패 처리, 검수 라우터."""

from __future__ import annotations

from io import BytesIO
from typing import Any
from uuid import UUID, uuid4

import httpx
from PIL import Image

from app.core.errors import ExternalServiceError
from app.deps import get_draft_repo, get_storage_client
from app.main import create_app
from app.repositories.draft_repo import DraftTarget
from app.services.draft_batch import DraftBatch
from app.services.draft_service import (
    DraftService,
    review_targets,
    split_headline,
    to_draft_text,
)
from app.services.id_card_renderer import CARD_H, CARD_W, IdCardContent, render_id_card


def _png(size: tuple[int, int] = (1024, 1536)) -> bytes:
    out = BytesIO()
    Image.new("RGB", size, (200, 200, 200)).save(out, format="PNG")
    return out.getvalue()


# ──────────────────────────────────────────────────────────────
# 문구
# ──────────────────────────────────────────────────────────────


def test_split_headline_strips_career_suffix() -> None:
    assert split_headline("아이디어를 비행으로 구현하는 드론 전문가", "드론 전문가") == (
        "아이디어를 비행으로 구현하는"
    )


def test_split_headline_keeps_name_when_career_not_suffix() -> None:
    """떼어낼 수 없으면 이름 전체를 두고 검수자가 고친다."""
    assert split_headline("드론 전문가가 되는 탐험가", "드론 전문가") == "드론 전문가가 되는 탐험가"


def test_to_draft_text_maps_codex_output() -> None:
    text = to_draft_text(
        {
            "persona_name": "처음 쓰는 사람의 불편을 발견하는 UX 디자이너",
            "career_name": "UX 디자이너",
            "short_description": "설명",
        }
    )
    assert text.base_career == "UX 디자이너"
    assert text.headline == "처음 쓰는 사람의 불편을 발견하는"
    assert text.tagline == "설명"


# ──────────────────────────────────────────────────────────────
# 카드 합성
# ──────────────────────────────────────────────────────────────


def test_render_id_card_outputs_portrait_card_png() -> None:
    png = render_id_card(
        _png(),
        IdCardContent(
            student_name="김나비",
            school="대전관저중학교",
            grade=2,
            class_no=2,
            student_no=12,
            headline="아이디어를 비행으로 구현하는 아주 아주 긴 수식어가 들어가도 잘려선 안 된다",
            base_career="드론 전문가",
            qr_data="https://example.com/p/1",
        ),
    )
    img = Image.open(BytesIO(png))
    assert img.format == "PNG"
    assert img.size == (CARD_W, CARD_H)


def test_render_id_card_without_image_uses_fallback() -> None:
    """생성 이미지가 없어도(사진 없음·codex 거절) 카드는 폴백 캐릭터로 나와야 한다."""
    png = render_id_card(
        None,
        IdCardContent(
            student_name="홍길동",
            school="대전중학교",
            grade=1,
            class_no=1,
            student_no=1,
            headline="",
            base_career="동물훈련사",
            qr_data="https://example.com/p/2",
        ),
    )
    assert Image.open(BytesIO(png)).size == (CARD_W, CARD_H)


# ──────────────────────────────────────────────────────────────
# 이미지 생성 실패 — 일괄 생성이 멈추지 않고 초안에 사유가 남아야 한다
# ──────────────────────────────────────────────────────────────


class _Draft:
    def __init__(
        self,
        *,
        photo_key: str | None = "uploads/p.jpg",
        verdict: str | None = None,
        verdict_reason: str = "",
    ) -> None:
        self.id = uuid4()
        self.student_id = uuid4()
        self.session_id = uuid4()
        self.photo_key = photo_key
        self.verdict = verdict
        self.verdict_reason = verdict_reason
        self.name = "하늘을 나는 드론 전문가"
        self.tagline = "설명"


class _Drafts:
    def __init__(self, draft: _Draft) -> None:
        self.draft = draft
        self.saved: dict[str, Any] = {}
        self.marked = False

    async def get(self, draft_id: UUID) -> Any:
        return self.draft

    async def mark_regenerated(self, draft_id: UUID) -> None:
        self.marked = True

    async def save_image(self, draft_id: UUID, *, image_key: str | None, error: str | None) -> None:
        self.saved = {"image_key": image_key, "error": error}


class _Storage:
    def __init__(self) -> None:
        self.uploaded: list[str] = []

    async def download(self, key: str) -> bytes:
        return b"photo"

    async def upload_generated_image(self, path: str, data: bytes, *, content_type: str) -> str:
        self.uploaded.append(path)
        return f"ai-images/{path}"


class _Codex:
    def __init__(self, error: Exception | None = None) -> None:
        self._error = error

    async def generate_image(
        self,
        prompt: str,
        *,
        photo: bytes | None = None,
        layout: bytes | None = None,
        background: bytes | None = None,
    ) -> bytes:
        self.prompt = prompt
        self.layout = layout
        self.background = background
        if self._error:
            raise self._error
        return _png()


async def test_generate_image_for_triangle_draft_adds_review_reason() -> None:
    """△ 초안의 단건 이미지 재생성은 따로 주지 않아도 이유를 프롬프트에 붙인다."""
    drafts = _Drafts(_Draft(verdict="triangle", verdict_reason="기존 사진과 너무 같음"))
    codex = _Codex()
    await _service(drafts, codex, _Storage()).generate_image(drafts.draft.id)

    assert '검수자가 보고 남긴 의견: "기존 사진과 너무 같음"' in codex.prompt


async def test_generate_image_without_triangle_uses_base_prompt() -> None:
    drafts = _Drafts(_Draft(verdict="o", verdict_reason="좋음"))
    codex = _Codex()
    await _service(drafts, codex, _Storage()).generate_image(drafts.draft.id)

    assert "검수 피드백" not in codex.prompt


async def test_regenerate_image_marks_draft_for_re_review() -> None:
    """검수 화면의 이미지 재생성은 재검수 대상으로 기록한 뒤 만든다."""
    drafts = _Drafts(_Draft())
    await _service(drafts, _Codex(), _Storage()).regenerate_image(drafts.draft.id)
    assert drafts.marked is True
    assert drafts.saved["image_key"] is not None


def test_review_targets_picks_text_image_or_both() -> None:
    assert review_targets("기존 사진과 유사") == (False, True)
    assert review_targets("직업명 괜찮나요") == (True, False)
    assert review_targets("얼굴 애매, 직업 애매") == (True, True)
    assert review_targets("") == (False, True)  # 이유 없으면 이미지


async def test_regenerate_from_review_text_reason_rewrites_text_with_feedback() -> None:
    drafts = _Drafts(_Draft(verdict="triangle", verdict_reason="직업명이 어색함"))
    service = _service(drafts, _Codex(), _Storage())
    calls: list[tuple[str, Any]] = []

    async def fake_text(session_id: UUID, student_id: UUID, *, feedback: str | None = None) -> UUID:
        calls.append(("text", feedback))
        return drafts.draft.id

    async def fake_image(draft_id: UUID, *, feedback: str | None = None) -> None:
        calls.append(("image", feedback))

    service.generate_text = fake_text  # type: ignore[method-assign]
    service.generate_image = fake_image  # type: ignore[method-assign]
    await service.regenerate_from_review(drafts.draft.id)

    assert [c[0] for c in calls] == ["text"]
    assert '검수 의견: "직업명이 어색함"' in calls[0][1]
    assert "하늘을 나는 드론 전문가" in calls[0][1]  # 이전 결과도 함께 준다


class _Students:
    async def ensure_card_code(self, student_id: UUID) -> str:
        return "AB23CD45"


def _service(drafts: _Drafts, codex: _Codex, storage: _Storage) -> DraftService:
    return DraftService(
        codex=codex,  # type: ignore[arg-type]  # 테스트 stub
        storage=storage,  # type: ignore[arg-type]
        sessions=None,  # type: ignore[arg-type]
        drafts=drafts,  # type: ignore[arg-type]
        students=_Students(),  # type: ignore[arg-type]
        qr_origin="http://localhost:4000",
    )


async def test_generate_image_saves_new_key() -> None:
    drafts, storage = _Drafts(_Draft()), _Storage()
    await _service(drafts, _Codex(), storage).generate_image(drafts.draft.id)

    assert drafts.saved["error"] is None
    assert drafts.saved["image_key"].startswith(f"ai-images/{drafts.draft.student_id}/")


class _CardDraft(_Draft):
    image_key = None  # 폴백 캐릭터로 합성 — 다운로드 없이 렌더러만 탄다
    student_name, school, grade, class_no, student_no = "홍길동", "대전중학교", 2, 3, 14
    headline, base_career = "하늘을 설계하는", "드론 전문가"


class _CardStorage(_Storage):
    async def upload_card_image(self, path: str, data: bytes, *, content_type: str) -> str:
        self.uploaded.append(path)
        return f"cards/{path}"


async def test_upload_card_reuses_fixed_key_so_rerender_overwrites() -> None:
    draft, storage = _CardDraft(), _CardStorage()
    service = _service(_Drafts(draft), _Codex(), storage)

    first = await service.upload_card(draft)  # type: ignore[arg-type]  # 테스트 stub
    second = await service.upload_card(draft)  # type: ignore[arg-type]

    assert first == second == f"cards/{draft.student_id}/{draft.id}.png"
    assert len(storage.uploaded) == 2


async def test_generate_image_attaches_layout_background_and_stores_4x5() -> None:
    """구도 기준 사진을 함께 넣고, 모델이 2:3으로 줘도 저장본은 4:5여야 한다."""
    drafts, storage, codex = _Drafts(_Draft()), _Storage(), _Codex()
    stored: list[bytes] = []

    async def upload(path: str, data: bytes, *, content_type: str) -> str:
        stored.append(data)
        return f"ai-images/{path}"

    storage.upload_generated_image = upload  # type: ignore[method-assign]  # 업로드 바이트 캡처
    await _service(drafts, codex, storage).generate_image(drafts.draft.id)

    assert codex.layout  # 두 번째 첨부로 기준 사진이 들어갔다
    assert codex.background  # 세 번째 첨부로 배경이 들어갔다
    assert Image.open(BytesIO(stored[0])).size == (1024, 1280)


async def test_generate_image_failure_records_error_instead_of_raising() -> None:
    drafts = _Drafts(_Draft())
    codex = _Codex(ExternalServiceError("codex 실행이 실패했습니다."))
    await _service(drafts, codex, _Storage()).generate_image(drafts.draft.id)

    assert drafts.saved == {"image_key": None, "error": "codex 실행이 실패했습니다."}


async def test_generate_image_without_photo_records_error() -> None:
    drafts, storage = _Drafts(_Draft(photo_key=None)), _Storage()
    await _service(drafts, _Codex(), storage).generate_image(drafts.draft.id)

    assert drafts.saved["error"] == "원본 사진 없음"
    assert storage.uploaded == []


# ──────────────────────────────────────────────────────────────
# 라우터
# ──────────────────────────────────────────────────────────────


class _MissingDrafts:
    async def get(self, draft_id: UUID) -> None:
        return None


async def test_reject_unknown_draft_is_404() -> None:
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: _MissingDrafts()
    app.dependency_overrides[get_storage_client] = lambda: _Storage()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(f"/api/dev/drafts/{uuid4()}/reject")

    assert res.status_code == 404


class _ScopedDrafts:
    """list_drafts·count_by_status에 넘어온 범위를 기록한다."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def list_drafts(self, **kwargs: Any) -> list[Any]:
        self.calls.append(kwargs)
        return []

    async def count_by_status(self, **kwargs: Any) -> dict[str, int]:
        self.calls.append(kwargs)
        return {"pending": 0, "approved": 0, "rejected": 0}


class _NoUrlStorage:
    async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
        return {}


async def test_list_drafts_scopes_list_and_counts_to_class() -> None:
    repo = _ScopedDrafts()
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    app.dependency_overrides[get_storage_client] = lambda: _NoUrlStorage()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/dev/drafts",
            params={"status": "pending", "school": "한빛중", "grade": 2, "class_no": 3},
        )

    assert res.status_code == 200
    scope = {"school": "한빛중", "grade": 2, "class_no": 3}
    assert repo.calls == [{"status": "pending", "limit": 100, "offset": 0, **scope}, scope]


# ──────────────────────────────────────────────────────────────
# 일괄 실행기
# ──────────────────────────────────────────────────────────────


class _BatchService:
    """두 번째 학생의 텍스트 생성만 실패하는 DraftService stub."""

    def __init__(self, fail_student: UUID) -> None:
        self._fail = fail_student
        self.images: list[UUID] = []

    async def generate_text(self, session_id: UUID, student_id: UUID) -> UUID:
        if student_id == self._fail:
            raise ExternalServiceError("codex 실행이 실패했습니다.")
        return session_id

    async def generate_image(self, draft_id: UUID) -> None:
        self.images.append(draft_id)

    async def regenerate_image(self, draft_id: UUID) -> None:
        self.images.append(draft_id)


async def test_batch_continues_past_a_failed_student() -> None:
    targets = [DraftTarget(session_id=uuid4(), student_id=uuid4()) for _ in range(3)]
    service = _BatchService(fail_student=targets[1].student_id)

    progress = await DraftBatch().run(service, targets, concurrency=2)  # type: ignore[arg-type]

    assert (progress.total, progress.done, progress.failed) == (3, 3, 1)
    assert not progress.running
    assert sorted(service.images) == sorted([targets[0].session_id, targets[2].session_id])
    assert "codex 실행이 실패했습니다." in progress.errors[0]


async def test_batch_start_images_regenerates_each_draft() -> None:
    batch = DraftBatch()
    service = _BatchService(fail_student=uuid4())
    ids = [uuid4(), uuid4(), uuid4()]

    batch.start_images(service, ids, concurrency=2, label="이미지 재생성 3명")  # type: ignore[arg-type]
    assert batch._task is not None
    progress = await batch._task

    assert (progress.label, progress.total, progress.done) == ("이미지 재생성 3명", 3, 3)
    assert sorted(service.images) == sorted(ids)


async def test_batch_start_review_runs_review_regeneration() -> None:
    batch = DraftBatch()
    done: list[UUID] = []

    class _Svc:
        async def regenerate_from_review(self, draft_id: UUID) -> None:
            done.append(draft_id)

    ids = [uuid4() for _ in range(3)]
    batch.start_review(_Svc(), ids, concurrency=20, label="△")  # type: ignore[arg-type]
    assert batch._task is not None
    await batch._task
    assert sorted(done) == sorted(ids)


class _VerdictDrafts:
    def __init__(self) -> None:
        self.calls: list[tuple[str | None, str]] = []

    async def get(self, draft_id: UUID) -> Any:
        from tests.test_admin_reviews import _record

        return _record()

    async def set_verdict(self, draft_id: UUID, verdict: str | None, reason: str) -> None:
        self.calls.append((verdict, reason))


async def test_dev_set_verdict_saves_trimmed_reason() -> None:
    repo = _VerdictDrafts()
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    app.dependency_overrides[get_storage_client] = lambda: _NoUrlStorage()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        bad = await client.put(f"/api/dev/drafts/{uuid4()}/verdict", json={"verdict": "maybe"})
        ok = await client.put(
            f"/api/dev/drafts/{uuid4()}/verdict", json={"verdict": "triangle", "reason": " 수염 "}
        )

    assert bad.status_code == 422
    assert ok.status_code == 200, ok.text
    assert repo.calls == [("triangle", "수염")]


class _IssueDrafts:
    def __init__(self) -> None:
        self.issues: list[str] = []

    async def list_issue(self, issue: str, *, limit: int) -> list[Any]:
        self.issues.append(issue)
        return []

    async def count_issues(self) -> dict[str, int]:
        return {"codex_failed": 1, "codex_refused": 2, "triangle": 3}


async def test_list_draft_issues_by_kind() -> None:
    repo = _IssueDrafts()
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    app.dependency_overrides[get_storage_client] = lambda: _NoUrlStorage()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        ok = await client.get("/api/dev/drafts/issues", params={"issue": "triangle"})
        bad = await client.get("/api/dev/drafts/issues", params={"issue": "nope"})

    assert ok.status_code == 200, ok.text
    assert ok.json() == {
        "drafts": [],
        "counts": {"codex_failed": 1, "codex_refused": 2, "triangle": 3},
    }
    assert repo.issues == ["triangle"]
    assert bad.status_code == 422


async def test_regenerate_images_starts_background_job_with_unique_ids() -> None:
    from app.deps import get_draft_service
    from app.services.draft_batch import dev_batch

    service = _BatchService(fail_student=uuid4())
    app = create_app()
    app.dependency_overrides[get_draft_service] = lambda: service
    one, two = str(uuid4()), str(uuid4())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/dev/drafts/regenerate-images", json={"ids": [one, two, one]})
    assert dev_batch._task is not None
    await dev_batch._task

    assert res.status_code == 202, res.text
    assert res.json()["label"] == "이미지 재생성 2명"
    assert sorted(map(str, service.images)) == sorted([one, two])


class _AllTargets:
    def __init__(self, targets: list[DraftTarget]) -> None:
        self.targets = targets
        self.kwargs: dict[str, Any] = {}

    async def list_targets(self, **kwargs: Any) -> list[DraftTarget]:
        self.kwargs = kwargs
        return self.targets

    async def count_targets(self) -> int:
        return len(self.targets)


async def test_batch_all_starts_every_target_without_class_filter() -> None:
    from app.deps import get_draft_service
    from app.services.draft_batch import dev_batch

    targets = [DraftTarget(session_id=uuid4(), student_id=uuid4()) for _ in range(2)]
    repo = _AllTargets(targets)
    service = _BatchService(fail_student=uuid4())
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    app.dependency_overrides[get_draft_service] = lambda: service
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        count = await client.get("/api/dev/drafts/targets")
        res = await client.post("/api/dev/drafts/batch/all", json={"concurrency": 2})
    assert dev_batch._task is not None
    await dev_batch._task

    assert count.json() == {"total": 2}
    assert res.status_code == 202, res.text
    assert res.json()["label"] == "미생성 전체 2명"
    assert repo.kwargs == {"limit": 100_000}  # 학교·반 조건 없이 전원
    assert sorted(service.images) == sorted(t.session_id for t in targets)


class _DeletingDrafts:
    def __init__(self) -> None:
        self.ids: list[UUID] = []

    async def delete_drafts(self, draft_ids: list[UUID]) -> int:
        self.ids = draft_ids
        return len(draft_ids)


async def _post_delete(repo: Any, body: dict[str, Any]) -> httpx.Response:
    app = create_app()
    app.dependency_overrides[get_draft_repo] = lambda: repo
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/dev/drafts/delete", json=body)


async def test_delete_drafts_dedupes_ids() -> None:
    repo, a, b = _DeletingDrafts(), uuid4(), uuid4()
    res = await _post_delete(repo, {"ids": [str(a), str(b), str(a)]})

    assert res.status_code == 200
    assert res.json() == {"deleted": 2}
    assert repo.ids == [a, b]


async def test_delete_drafts_rejects_empty_ids() -> None:
    res = await _post_delete(_DeletingDrafts(), {"ids": []})

    assert res.status_code == 422


def test_card_qr_points_to_short_public_path() -> None:
    from app.services.draft_service import card_qr_data

    assert card_qr_data("https://i-be.kr/", "AB23CD45") == "https://i-be.kr/p/AB23CD45"


async def test_preview_card_returns_qr_url_for_review_screen() -> None:
    draft = _CardDraft()
    service = _service(_Drafts(draft), _Codex(), _CardStorage())  # type: ignore[arg-type]

    png, qr_url = await service.preview_card(draft.id)

    assert png.startswith(b"\x89PNG")
    assert qr_url == "http://localhost:4000/p/AB23CD45"
