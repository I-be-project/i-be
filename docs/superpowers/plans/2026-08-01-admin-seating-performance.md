# 관리자 진행 현황(좌석표) 성능 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 진행 현황 좌석표에서 학교 선택 시 31.5초 걸리던 응답을 86 ms로 줄이고, `limit: 1000` 잘림 버그를 없앤다.

**Architecture:** (1) 목록 API가 학생마다 S3 클라이언트를 새로 만들어 쓰지도 않는 사진 URL을 서명하던 것을, 클라이언트 1개로 일괄 서명하도록 바꾸고 `include_photo=false`로 아예 건너뛸 수 있게 한다. (2) 학년·반 목록을 학생 전원에서 역산하던 것을, 반별 집계 엔드포인트 한 번으로 대체하고 학생은 선택한 반만 불러온다.

**Tech Stack:** FastAPI · asyncpg(Postgres/Supabase) · aioboto3 · pytest · Next.js 16 · TypeScript · vitest

설계 근거와 실측치: [`docs/superpowers/specs/2026-08-01-admin-seating-performance-design.md`](../specs/2026-08-01-admin-seating-performance-design.md)

## Global Constraints

- **외부 API 계약을 깨지 않는다.** `GET /api/admin/students` 응답의 `items[].photo_url` 필드를 제거하지 않는다. `include_photo`의 기본값은 반드시 `true`. `backend/scripts/export_students.py`와 `docs/2026-07-31-admin-api-usage.md`가 이 필드에 의존하며 CORS가 전 오리진 개방된 상태다.
- 백엔드는 mypy `strict` 기준. `# type: ignore`를 쓰면 사유를 주석으로 남긴다.
- 백엔드 검증: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest` (모두 `backend/`에서 실행)
- 프론트엔드 검증: `npm run lint && npm run build && npm run test` (모두 `frontend/`에서 실행)
- 코드 주석·UI 텍스트·커밋 메시지는 한국어. 커밋은 Conventional Commits 접두사 + 한국어 설명.
- 커밋 메시지에 자동 생성 푸터·서명을 넣지 않는다.
- `mypy app`만 검사하므로 `tests/`는 타입 검사 대상이 아니다. 그래도 기존 테스트 스타일(타입 힌트 포함)을 따른다.
- 동작이 바뀌는 백엔드 변경에는 대응 테스트를 추가한다.

## File Structure

**백엔드**

| 파일 | 책임 | 변경 |
|---|---|---|
| `backend/app/adapters/storage_client.py` | S3 접근. 여러 key 일괄 서명 메서드 추가 | 수정 |
| `backend/app/repositories/student_repo.py` | `pii.students` 접근. 반별 집계 쿼리 추가 | 수정 |
| `backend/app/schemas/admin.py` | admin 요청/응답 모델. `has_photo`·집계·사진 URL 모델 추가 | 수정 |
| `backend/app/services/admin_service.py` | 서명 일괄화, `include_photo` 분기, 집계·단건 사진 조회 | 수정 |
| `backend/app/routers/admin.py` | 신규 엔드포인트 2개, `include_photo` 쿼리 파라미터 | 수정 |
| `backend/tests/test_auth_service.py` | 공용 fake(`FakeStorage`·`FakeStudentRepo`)에 신규 메서드 추가 | 수정 |
| `backend/tests/test_storage_client.py` | 일괄 서명 단위 테스트 | 수정 |
| `backend/tests/test_admin_service.py` | 서비스 단위 테스트 | 수정 |
| `backend/tests/test_admin_router.py` | 라우터 통합 테스트 | 수정 |

**프론트엔드**

| 파일 | 책임 | 변경 |
|---|---|---|
| `frontend/lib/api.ts` | API 호출 계층. 타입 2개·fetcher 2개 추가 | 수정 |
| `frontend/lib/api.test.ts` | fetcher URL/헤더 테스트 | 수정 |
| `frontend/components/admin/StudentDetailDialog.tsx` | 사진 출처를 상세 응답으로 전환 | 수정 |
| `frontend/app/admin/page.tsx` | 회원 목록. 사진 지연 로드 | 수정 |
| `frontend/app/admin/seating/page.tsx` | 좌석표. 집계 + 반 단위 조회로 재구성 | 수정 |

**신규 파일은 없다.** 모두 기존 파일 수정이다.

## Task 순서 근거

Task 1(일괄 서명)을 먼저 해서 Task 2가 이미 정리된 루프를 건드리게 한다.
Task 6(다이얼로그)이 Task 7(회원 목록)보다 **먼저**여야 한다 — Task 7이 `include_photo=false`를 켜는 순간 목록의 `photo_url`이 `null`이 되므로, 다이얼로그가 상세 응답에서 사진을 읽도록 먼저 바꿔두지 않으면 사진이 깨진다.

---

### Task 1: StorageClient 일괄 서명

**Files:**
- Modify: `backend/app/adapters/storage_client.py:93-101` (뒤에 메서드 추가)
- Modify: `backend/app/services/admin_service.py:66-75, 97-117, 129-147`
- Modify: `backend/tests/test_auth_service.py:139-140` (`FakeStorage`)
- Test: `backend/tests/test_storage_client.py`

**Interfaces:**
- Produces: `StorageClient.create_signed_urls(keys: list[str], *, ttl_seconds: int) -> dict[str, str]` — key→URL 매핑. 서명에 실패한 key는 결과에서 빠진다. `keys`가 비면 클라이언트를 만들지 않고 `{}`를 반환.
- Produces: `AdminService._signed_urls(keys: list[str]) -> dict[str, str]` — 위 메서드를 `_PHOTO_URL_TTL_SECONDS`로 감싼 private 헬퍼. 전체 실패 시 `{}`.

- [ ] **Step 1: 일괄 서명 실패 테스트를 작성한다**

`backend/tests/test_storage_client.py` 상단 import에 `from typing import cast`를 추가하고, 파일 끝에 아래를 붙인다.

```python
class _CountingFactory:
    """클라이언트 생성 횟수를 세는 팩토리 — '한 번만 만드는지' 검증용."""

    def __init__(self, fake: _FakeS3) -> None:
        self.fake = fake
        self.calls = 0

    def __call__(self) -> _FakeS3:
        self.calls += 1
        return self.fake


class _FlakyS3(_FakeS3):
    """특정 key의 서명만 실패하는 fake."""

    async def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        params = cast(dict[str, str], kwargs["Params"])
        if params["Key"] == "uploads/bad.jpg":
            raise RuntimeError("서명 실패(테스트)")
        return await super().generate_presigned_url(operation, **kwargs)


def _make_counting(fake: _FakeS3) -> tuple[StorageClient, _CountingFactory]:
    factory = _CountingFactory(fake)
    client = StorageClient(
        bucket="test-bucket",
        region="ap-northeast-2",
        access_key_id="AKIATEST",
        secret_access_key="secretvalue",
        prefix_uploads="uploads",
        prefix_ai_images="ai-images",
        prefix_cards="cards",
        client_factory=factory,
    )
    return client, factory


async def test_create_signed_urls_reuses_single_client():
    fake = _FakeS3()
    client, factory = _make_counting(fake)

    urls = await client.create_signed_urls(
        ["uploads/a.jpg", "uploads/b.jpg", "uploads/a.jpg"], ttl_seconds=600
    )

    assert urls == {
        "uploads/a.jpg": "https://signed.example/get",
        "uploads/b.jpg": "https://signed.example/get",
    }
    # 핵심: key가 3개여도 클라이언트는 한 번만 만든다.
    assert factory.calls == 1
    # 중복 key는 한 번만 서명한다.
    assert len(fake.sign_calls) == 2
    assert fake.sign_calls[0][0] == "get_object"
    assert fake.sign_calls[0][1]["Params"] == {"Bucket": "test-bucket", "Key": "uploads/a.jpg"}
    assert fake.sign_calls[0][1]["ExpiresIn"] == 600


async def test_create_signed_urls_empty_creates_no_client():
    fake = _FakeS3()
    client, factory = _make_counting(fake)

    assert await client.create_signed_urls([], ttl_seconds=600) == {}
    assert factory.calls == 0


async def test_create_signed_urls_skips_failing_key():
    fake = _FlakyS3()
    client, _ = _make_counting(fake)

    urls = await client.create_signed_urls(
        ["uploads/ok.jpg", "uploads/bad.jpg"], ttl_seconds=600
    )

    # 실패한 key만 빠지고 나머지는 살아남는다.
    assert "uploads/bad.jpg" not in urls
    assert urls["uploads/ok.jpg"] == "https://signed.example/get"
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: FAIL — `AttributeError: 'StorageClient' object has no attribute 'create_signed_urls'`

- [ ] **Step 3: `create_signed_urls`를 구현한다**

`backend/app/adapters/storage_client.py`의 `create_signed_url` 바로 뒤(101번 줄 `return cast(str, url)` 다음)에 추가한다.

```python
    async def create_signed_urls(
        self, keys: list[str], *, ttl_seconds: int
    ) -> dict[str, str]:
        """여러 key를 클라이언트 하나로 서명해 {key: url}로 돌려준다.

        호출마다 클라이언트를 새로 만들면 건당 40~50 ms가 드는데, 서명 연산 자체는
        네트워크 없는 로컬 계산이라 0.3 ms다. 클라이언트를 한 번만 만들어 전 건을
        서명하면 703건 기준 31초 → 0.18초가 된다.
        개별 key의 서명 실패는 그 key만 결과에서 빼고 넘어간다(단건 create_signed_url의
        graceful 동작과 동일).
        """
        if not keys:
            return {}
        urls: dict[str, str] = {}
        async with self._client_factory() as s3:
            for key in dict.fromkeys(keys):  # 중복 key는 한 번만 서명
                try:
                    urls[key] = cast(
                        str,
                        await s3.generate_presigned_url(
                            "get_object",
                            Params={"Bucket": self._bucket, "Key": key},
                            ExpiresIn=ttl_seconds,
                        ),
                    )
                except Exception:
                    continue
        return urls
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: PASS (신규 3개 포함 전부)

- [ ] **Step 5: `FakeStorage`에 같은 메서드를 추가한다**

`backend/tests/test_auth_service.py`의 `FakeStorage.create_signed_url`(139번 줄) 바로 뒤에 추가한다.

```python
    async def create_signed_urls(
        self, keys: list[str], *, ttl_seconds: int
    ) -> dict[str, str]:
        self.batch_sign_calls += 1
        return {k: f"https://signed.example/{k}?ttl={ttl_seconds}" for k in dict.fromkeys(keys)}
```

그리고 `FakeStorage.__init__`(130-133번 줄)에 카운터를 추가한다.

```python
    def __init__(self) -> None:
        self.uploads: list[tuple[str, bytes, str]] = []
        self.deleted: list[str] = []
        self.delete_failures: set[str] = set()
        self.batch_sign_calls = 0
```

- [ ] **Step 6: `AdminService`가 일괄 서명을 쓰도록 배선한다**

`backend/app/services/admin_service.py`의 `_signed_url`(66-75번 줄) 뒤에 헬퍼를 추가한다.

```python
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
```

`list_students`의 조립 루프(97-116번 줄)를 아래로 바꾼다.

```python
        progress = await self._sessions.get_progress_for_students([r.id for r in records])
        photo_urls = await self._signed_urls([r.photo_key for r in records if r.photo_key])
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
                    consent_privacy=r.consent_privacy,
                    created_at=r.created_at,
                    progress=_to_progress(progress.get(r.id)),
                )
            )
        return AdminStudentList(total=total, items=items)
```

`get_student_detail`의 세션 조립(129-162번 줄)에서도 서명을 앞으로 모은다. `contents = await self._sessions.list_sessions_with_content(student_id)` 바로 다음에 아래를 넣는다.

```python
        # 카드 이미지와 학생 사진을 한 번의 클라이언트로 몰아서 서명한다.
        sign_keys = [c.card_image_key for c in contents if c.card_image_key]
        if student.photo_key:
            sign_keys.append(student.photo_key)
        signed = await self._signed_urls(sign_keys)
```

그리고 루프 안의 `card_image_url=await self._signed_url(c.card_image_key),`를 아래로 바꾼다.

```python
                    card_image_url=(
                        signed.get(c.card_image_key) if c.card_image_key else None
                    ),
```

마지막 `AdminStudentDetail(...)`의 `photo_url=await self._signed_url(student.photo_key),`도 바꾼다.

```python
            photo_url=signed.get(student.photo_key) if student.photo_key else None,
```

- [ ] **Step 7: 전체 백엔드 검증을 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 PASS. 특히 `test_admin_service.py`·`test_admin_router.py`·`test_export_students_script.py`가 **수정 없이** 통과해야 한다 — 응답 형태가 그대로라는 뜻이다.

- [ ] **Step 8: 커밋**

```bash
git add backend/app/adapters/storage_client.py backend/app/services/admin_service.py \
        backend/tests/test_storage_client.py backend/tests/test_auth_service.py
git commit -m "perf: S3 presigned URL을 클라이언트 하나로 일괄 서명하도록 변경"
```

---

### Task 2: 목록 API에 `include_photo` 옵트아웃과 `has_photo` 필드

**Files:**
- Modify: `backend/app/schemas/admin.py:37-49`
- Modify: `backend/app/services/admin_service.py:77-117`
- Modify: `backend/app/routers/admin.py:30-51`
- Test: `backend/tests/test_admin_service.py`, `backend/tests/test_admin_router.py`

**Interfaces:**
- Consumes: `AdminService._signed_urls` (Task 1), `FakeStorage.batch_sign_calls` 카운터 (Task 1 Step 5)
- Produces: `AdminStudentItem.has_photo: bool` — 사진 보유 여부. `photo_url`이 `null`이어도 UI가 이니셜/아이콘을 구분할 수 있게 한다.
- Produces: `AdminService.list_students(..., include_photo: bool = True)` — 거짓이면 서명을 아예 건너뛰고 `photo_url`은 전부 `None`.
- Produces: 쿼리 파라미터 `include_photo: bool = True`

- [ ] **Step 1: 실패하는 서비스 테스트를 작성한다**

`backend/tests/test_admin_service.py` 파일 끝에 추가한다.

```python
async def test_list_students_include_photo_false_skips_signing():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    await _seed(repo)
    svc = _svc(repo, storage)

    res = await svc.list_students(
        q=None, school=None, grade=None, class_no=None,
        limit=50, offset=0, include_photo=False,
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_admin_service.py -v -k include_photo`
Expected: FAIL — `TypeError: list_students() got an unexpected keyword argument 'include_photo'`

- [ ] **Step 3: 스키마에 `has_photo`를 추가한다**

`backend/app/schemas/admin.py`의 `AdminStudentItem`에서 `photo_url` 아래에 추가한다.

```python
    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")
    has_photo: bool = Field(
        False,
        description="사진 보유 여부. include_photo=false여서 photo_url이 null이어도 유무를 알 수 있다.",
    )
```

- [ ] **Step 4: 서비스에 `include_photo`를 추가한다**

`backend/app/services/admin_service.py`의 `list_students` 시그니처에 파라미터를 더한다.

```python
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
    ) -> AdminStudentList:
        """관리자 목록.

        include_photo 기본값이 true인 이유: 이 응답의 photo_url은 외부에 공개된
        계약이다(docs/2026-07-31-admin-api-usage.md, scripts/export_students.py).
        사진을 쓰지 않는 관리자 UI만 false로 호출해 서명 비용을 건너뛴다.
        """
```

그리고 Task 1에서 만든 서명 줄을 조건부로 바꾼다.

```python
        photo_urls = (
            await self._signed_urls([r.photo_key for r in records if r.photo_key])
            if include_photo
            else {}
        )
```

조립 루프의 `photo_url` 옆에 `has_photo`를 추가한다.

```python
                    photo_url=photo_urls.get(r.photo_key) if r.photo_key else None,
                    has_photo=bool(r.photo_key),
```

- [ ] **Step 5: 서비스 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_admin_service.py -v`
Expected: PASS

- [ ] **Step 6: 라우터 테스트를 작성한다**

`backend/tests/test_admin_router.py` 파일 끝에 추가한다. 파일에 이미 있는 `_build`·`_client`·`_admin_token` 헬퍼를 쓴다 — 토큰 생성 코드를 테스트마다 복붙하지 않는다.

```python
async def test_list_students_include_photo_false_returns_null_urls() -> None:
    app, repo, storage, _ = _build()
    student = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=1,
        name="김영희", password="20110202", gender="female", consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students?include_photo=false",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        item = res.json()["items"][0]
        assert item["photo_url"] is None
        assert item["has_photo"] is True
        assert storage.batch_sign_calls == 0
    finally:
        await gen.aclose()


async def test_list_students_default_includes_photo_url() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=1,
        name="김영희", password="20110202", gender="female", consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        item = res.json()["items"][0]
        # 외부 계약: 파라미터 없이 부르면 photo_url이 그대로 온다.
        assert item["photo_url"] is not None
        assert item["has_photo"] is True
    finally:
        await gen.aclose()
```

- [ ] **Step 7: 라우터에 쿼리 파라미터를 추가한다**

`backend/app/routers/admin.py`의 `list_students`에 파라미터를 더하고 서비스로 넘긴다.

```python
    sort: AdminStudentSort | None = None,
    include_photo: bool = True,
) -> AdminStudentList:
    """가입한 모든 학생 목록 — 검색/필터/정렬/페이지네이션, 사진 presigned URL 포함.

    include_photo=false면 사진 서명을 건너뛰어 훨씬 빠르다(사진이 필요 없는 관리자 UI용).
    기본값 true는 외부 공개 계약이므로 바꾸지 않는다.
    """
    return await admin.list_students(
        q=q,
        school=school,
        grade=grade,
        class_no=class_no,
        limit=limit,
        offset=offset,
        sort=sort,
        include_photo=include_photo,
    )
```

- [ ] **Step 8: 전체 백엔드 검증을 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 PASS. `test_export_students_script.py`가 수정 없이 통과하는지 특히 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add backend/app/schemas/admin.py backend/app/services/admin_service.py \
        backend/app/routers/admin.py backend/tests/test_admin_service.py \
        backend/tests/test_admin_router.py
git commit -m "feat: 관리자 목록 API에 사진 서명 생략 옵션(include_photo)과 has_photo 추가"
```

---

### Task 3: 단건 사진 URL 엔드포인트

**Files:**
- Modify: `backend/app/schemas/admin.py` (파일 끝)
- Modify: `backend/app/services/admin_service.py`
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_router.py`

**Interfaces:**
- Produces: `AdminStudentPhoto(photo_url: str | None)`
- Produces: `AdminService.get_student_photo_url(student_id: UUID) -> AdminStudentPhoto` — 학생이 없으면 `NotFoundError`
- Produces: `GET /api/admin/students/{student_id}/photo-url`

- [ ] **Step 1: 실패하는 라우터 테스트를 작성한다**

`backend/tests/test_admin_router.py` 파일 끝에 추가한다.

기존 `_build`·`_client`·`_admin_token` 헬퍼를 쓴다.

```python
async def test_student_photo_url_returns_signed_url() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=1,
        name="김영희", password="20110202", gender="female", consent_privacy=True,
    )
    await repo.update_photo_key(student.id, "uploads/photos/x/photo")
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{student.id}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        assert res.json()["photo_url"].startswith("https://signed.example/")
    finally:
        await gen.aclose()


async def test_student_photo_url_null_when_no_photo() -> None:
    app, repo, _, _ = _build()
    student = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=2,
        name="홍길동", password="20100101", gender="male", consent_privacy=True,
    )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{student.id}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        # 사진이 없는 것은 정상 상태다 — 404가 아니라 200 + null.
        assert res.status_code == 200
        assert res.json()["photo_url"] is None
    finally:
        await gen.aclose()


async def test_student_photo_url_404_for_unknown_student() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            f"/api/admin/students/{uuid4()}/photo-url",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 404
    finally:
        await gen.aclose()
```

파일 상단 import에 `from uuid import uuid4`가 없으면 추가한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_admin_router.py -v -k photo_url`
Expected: FAIL — 404 (라우트 없음) 또는 422

- [ ] **Step 3: 응답 스키마를 추가한다**

`backend/app/schemas/admin.py`의 `AdminStudentDetail` 아래에 추가한다.

```python
class AdminStudentPhoto(BaseModel):
    """학생 사진 presigned URL 단건 — 목록에서 사진을 뺀 뒤 필요할 때만 받는다."""

    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")
```

- [ ] **Step 4: 서비스 메서드를 추가한다**

`backend/app/services/admin_service.py`의 `get_student_detail` 뒤에 추가한다. import에 `AdminStudentPhoto`를 더한다.

```python
    async def get_student_photo_url(self, student_id: UUID) -> AdminStudentPhoto:
        """학생 사진 URL 1건. 목록이 include_photo=false일 때 UI가 필요 시점에 부른다."""
        student = await self._students.get_by_id(student_id)
        if student is None:
            raise NotFoundError("학생을 찾을 수 없습니다.")
        return AdminStudentPhoto(photo_url=await self._signed_url(student.photo_key))
```

- [ ] **Step 5: 라우터를 추가한다**

`backend/app/routers/admin.py`의 `student_detail` 뒤에 추가한다. import에 `AdminStudentPhoto`를 더한다.

```python
@router.get("/students/{student_id}/photo-url", response_model=AdminStudentPhoto)
async def student_photo_url(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminStudentPhoto:
    """학생 사진 presigned URL 1건 — 목록에서 사진을 뺀 화면이 필요할 때만 호출한다."""
    return await admin.get_student_photo_url(student_id)
```

세그먼트가 하나 더 있어 `/students/{student_id}`와 충돌하지 않으므로 선언 위치에 제약이 없다.

- [ ] **Step 6: 전체 백엔드 검증을 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/app/schemas/admin.py backend/app/services/admin_service.py \
        backend/app/routers/admin.py backend/tests/test_admin_router.py
git commit -m "feat: 관리자 학생 사진 URL 단건 조회 엔드포인트 추가"
```

---

### Task 4: 반별 진행 집계 엔드포인트

**Files:**
- Modify: `backend/app/repositories/student_repo.py` (dataclass + 메서드 추가)
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/app/services/admin_service.py`
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/tests/test_auth_service.py` (`FakeStudentRepo`)
- Test: `backend/tests/test_admin_service.py`, `backend/tests/test_admin_router.py`

**Interfaces:**
- Produces: `ClassProgressRow(grade: int, class_no: int, total: int, completed: int, in_progress: int, not_started: int)` — `app.repositories.student_repo`의 frozen dataclass
- Produces: `StudentRepository.get_class_progress(school: str) -> list[ClassProgressRow]` — (학년, 반) 오름차순
- Produces: `AdminClassProgress` — 위와 같은 필드의 Pydantic 모델
- Produces: `AdminService.get_class_progress(school: str) -> list[AdminClassProgress]`
- Produces: `GET /api/admin/progress/classes?school=<학교명>`

- [ ] **Step 1: `FakeStudentRepo`에 집계를 구현한다**

`backend/tests/test_auth_service.py`의 `FakeStudentRepo.__init__`에 상태를 더한다.

```python
    def __init__(self) -> None:
        self._by_key: dict[tuple[str, int, int, int], StudentRecord] = {}
        self._by_id: dict[UUID, StudentRecord] = {}
        # 집계 fake용 — 테스트가 학생별 최근 세션 상태를 직접 심는다.
        # None(키 없음)=세션 없음, "completed"=완료, 그 외=진행중.
        self.progress_status: dict[UUID, str] = {}
```

`list_schools` 뒤에 메서드를 추가한다. import에 `ClassProgressRow`를 더한다.

```python
    async def get_class_progress(self, school: str) -> list[ClassProgressRow]:
        buckets: dict[tuple[int, int], dict[str, int]] = {}
        for r in self._by_id.values():
            if r.deleted_at is not None or r.school != school:
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
                grade=g, class_no=c, total=b["total"], completed=b["completed"],
                in_progress=b["in_progress"], not_started=b["not_started"],
            )
            for (g, c), b in sorted(buckets.items())
        ]
```

- [ ] **Step 2: 실패하는 서비스 테스트를 작성한다**

`backend/tests/test_admin_service.py` 파일 끝에 추가한다.

```python
async def test_get_class_progress_buckets_by_grade_and_class():
    repo = FakeStudentRepo()
    storage = FakeStorage()
    a = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=1,
        name="가", password="p", gender="male", consent_privacy=True,
    )
    b = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=2,
        name="나", password="p", gender="female", consent_privacy=True,
    )
    await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=3,
        name="다", password="p", gender="male", consent_privacy=True,
    )
    await repo.create(
        school="한마당고", grade=2, class_no=5, student_no=1,
        name="라", password="p", gender="female", consent_privacy=True,
    )
    await repo.create(
        school="다른고", grade=1, class_no=1, student_no=1,
        name="마", password="p", gender="male", consent_privacy=True,
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
        school="한마당고", grade=3, class_no=2, student_no=1,
        name="가", password="p", gender="male", consent_privacy=True,
    )
    repo.progress_status[a.id] = "abandoned"
    svc = _svc(repo, storage)

    rows = await svc.get_class_progress("한마당고")

    # _to_progress와 같은 규칙 — 알 수 없는 상태는 진행중으로 수렴한다.
    assert rows[0].in_progress == 1
    assert rows[0].completed == 0
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_admin_service.py -v -k class_progress`
Expected: FAIL — `AttributeError: 'AdminService' object has no attribute 'get_class_progress'`

- [ ] **Step 4: 리포지토리에 집계 쿼리를 구현한다**

`backend/app/repositories/student_repo.py`의 `StudentRecord` 아래에 dataclass를 추가한다.

```python
@dataclass(frozen=True, slots=True)
class ClassProgressRow:
    """한 반의 진행 현황 집계 — 관리자 좌석표의 학년·반 선택과 배지에 쓴다."""

    grade: int
    class_no: int
    total: int
    completed: int
    in_progress: int
    not_started: int
```

`list_schools` 뒤에 메서드를 추가한다.

```python
    async def get_class_progress(self, school: str) -> list[ClassProgressRow]:
        """학교의 반별 진행 현황을 한 쿼리로 집계한다(좌석표의 학년·반 선택용).

        이 저장소에서 유일하게 generated 스키마를 함께 읽는다. 집계의 기준 테이블이
        pii.students(반별로 GROUP BY)라 여기 둔다.
        학생 전원을 받아 클라이언트에서 세는 대신 이 쿼리 하나를 쓴다 — 832명 기준
        446 ms/600 KB가 86 ms/2.9 KB가 된다.
        인덱스: students_login_key(school, ...)가 where를,
        sessions_student_recent(student_id, created_at desc)가 LATERAL을 받는다.
        상태 분류는 _to_progress와 같다 — abandoned 등 미지의 상태는 진행중으로 수렴.
        """
        query = """
            select s.grade, s.class_no,
                   count(*) as total,
                   count(*) filter (where ls.status = 'completed')      as completed,
                   count(*) filter (where ls.status is not null
                                      and ls.status <> 'completed')     as in_progress,
                   count(*) filter (where ls.status is null)            as not_started
            from pii.students s
            left join lateral (
                select status from generated.sessions se
                where se.student_id = s.id
                order by se.created_at desc
                limit 1
            ) ls on true
            where s.school = $1 and s.deleted_at is null
            group by s.grade, s.class_no
            order by s.grade, s.class_no
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, school)
        return [
            ClassProgressRow(
                grade=row["grade"],
                class_no=row["class_no"],
                total=row["total"],
                completed=row["completed"],
                in_progress=row["in_progress"],
                not_started=row["not_started"],
            )
            for row in rows
        ]
```

- [ ] **Step 5: 스키마와 서비스 메서드를 추가한다**

`backend/app/schemas/admin.py`의 `AdminStudentList` 아래에 추가한다.

```python
class AdminClassProgress(BaseModel):
    """한 반의 진행 현황 집계 — 좌석표의 학년·반 선택과 완료 배지에 쓴다."""

    grade: int
    class_no: int
    total: int
    completed: int
    in_progress: int
    not_started: int
```

`backend/app/services/admin_service.py`의 `list_schools` 뒤에 추가한다. import에 `AdminClassProgress`와 `ClassProgressRow`를 더한다.

```python
    async def get_class_progress(self, school: str) -> list[AdminClassProgress]:
        """학교의 반별 진행 현황 — 좌석표가 학생을 받기 전에 학년·반 목록을 그리는 데 쓴다."""
        rows = await self._students.get_class_progress(school)
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
```

- [ ] **Step 6: 서비스 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_admin_service.py -v -k class_progress`
Expected: PASS

- [ ] **Step 7: 라우터 테스트를 작성한다**

`backend/tests/test_admin_router.py` 파일 끝에 추가한다.

기존 `_build`·`_client`·`_admin_token` 헬퍼를 쓴다.

```python
async def test_class_progress_returns_rows_for_school() -> None:
    app, repo, _, _ = _build()
    a = await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=1,
        name="가", password="p", gender="male", consent_privacy=True,
    )
    await repo.create(
        school="한마당고", grade=1, class_no=1, student_no=2,
        name="나", password="p", gender="female", consent_privacy=True,
    )
    await repo.create(
        school="다른고", grade=1, class_no=1, student_no=1,
        name="다", password="p", gender="male", consent_privacy=True,
    )
    repo.progress_status[a.id] = "completed"
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/progress/classes?school=한마당고",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200
        rows = res.json()
        assert len(rows) == 1
        assert rows[0] == {
            "grade": 1, "class_no": 1, "total": 2,
            "completed": 1, "in_progress": 0, "not_started": 1,
        }
    finally:
        await gen.aclose()


async def test_class_progress_requires_admin_token() -> None:
    app, _, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/progress/classes?school=한마당고")
        assert res.status_code == 401
    finally:
        await gen.aclose()
```

- [ ] **Step 8: 라우터를 추가한다**

`backend/app/routers/admin.py`의 `bulk_delete_students` 뒤, `student_detail` 앞에 추가한다. import에 `AdminClassProgress`를 더한다.

```python
@router.get("/progress/classes", response_model=list[AdminClassProgress])
async def class_progress(
    school: str,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> list[AdminClassProgress]:
    """학교의 반별 진행 현황 집계 — 좌석표의 학년·반 선택과 완료 배지용.

    학생 개인정보를 내려보내지 않고 (학년, 반)별 카운트만 반환한다.
    """
    return await admin.get_class_progress(school)
```

- [ ] **Step 9: 전체 백엔드 검증을 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 PASS

- [ ] **Step 10: 실제 DB로 집계 SQL을 확인한다**

fake는 SQL을 검증하지 못하므로 한 번 눈으로 확인한다. `backend/`에서 실행한다.

```bash
PYTHONPATH=. uv run python -c "
import asyncio
from app.adapters.db_pool import DBPool
from app.config import Settings
from app.repositories.student_repo import StudentRepository

async def main():
    s = Settings()
    pool = DBPool(s.database_url); await pool.connect()
    repo = StudentRepository(pool)
    schools = await repo.list_schools()
    rows = await repo.get_class_progress(schools[0])
    print(schools[0], len(rows), '행')
    for r in rows[:5]:
        print(r)
        assert r.completed + r.in_progress + r.not_started == r.total
    await pool.disconnect()
asyncio.run(main())
"
```

Expected: 학년·반 행이 출력되고 `completed + in_progress + not_started == total`이 모든 행에서 성립. 읽기 전용이라 데이터를 바꾸지 않는다.

- [ ] **Step 11: 커밋**

```bash
git add backend/app/repositories/student_repo.py backend/app/schemas/admin.py \
        backend/app/services/admin_service.py backend/app/routers/admin.py \
        backend/tests/test_auth_service.py backend/tests/test_admin_service.py \
        backend/tests/test_admin_router.py
git commit -m "feat: 관리자 반별 진행 현황 집계 엔드포인트 추가"
```

---

### Task 5: 프론트엔드 API 계층

**Files:**
- Modify: `frontend/lib/api.ts:245-260, 313-351`
- Test: `frontend/lib/api.test.ts`

**Interfaces:**
- Consumes: Task 2·3·4의 엔드포인트
- Produces: `AdminStudentItem.has_photo: boolean`
- Produces: `AdminStudentQuery.include_photo?: boolean`
- Produces: `interface AdminClassProgress { grade, class_no, total, completed, in_progress, not_started }` (전부 `number`)
- Produces: `fetchAdminClassProgress(token: string, school: string): Promise<AdminClassProgress[]>`
- Produces: `fetchAdminStudentPhotoUrl(token: string, id: string): Promise<string | null>` — 응답의 `photo_url`만 꺼내 반환

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`frontend/lib/api.test.ts` 파일 끝에 추가하고, 상단 import에 `fetchAdminClassProgress`, `fetchAdminStudentPhotoUrl`, `fetchAdminStudents`를 더한다.

```ts
describe("fetchAdminClassProgress", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/admin/progress/classes with school query", async () => {
    const rows = [
      { grade: 1, class_no: 1, total: 3, completed: 1, in_progress: 1, not_started: 1 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAdminClassProgress("tok123", "한마당고");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8000/api/admin/progress/classes?school=${encodeURIComponent("한마당고")}`,
    );
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res[0].completed).toBe(1);
  });
});

describe("fetchAdminStudentPhotoUrl", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs the photo-url endpoint and unwraps photo_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ photo_url: "https://signed/x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const url = await fetchAdminStudentPhotoUrl("tok123", "s1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/admin/students/s1/photo-url",
    );
    expect(url).toBe("https://signed/x");
  });
});

describe("fetchAdminStudents include_photo", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("passes include_photo=false through to the query string", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminStudents("tok123", { school: "한마당고", include_photo: false });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("include_photo=false");
  });

  it("omits include_photo when not given", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminStudents("tok123", { school: "한마당고" });

    expect(fetchMock.mock.calls[0][0] as string).not.toContain("include_photo");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npm run test`
Expected: FAIL — `fetchAdminClassProgress is not a function` 등

- [ ] **Step 3: 타입을 추가한다**

`frontend/lib/api.ts`의 `AdminStudentItem`에서 `photo_url` 아래에 추가한다.

```ts
  photo_url: string | null;
  // 사진 보유 여부. include_photo=false로 받으면 photo_url은 null이지만 이 값은 유효하다.
  has_photo: boolean;
```

`AdminStudentList` 아래에 추가한다.

```ts
// GET /api/admin/progress/classes 응답 1행 — 한 반의 진행 현황 집계.
export interface AdminClassProgress {
  grade: number;
  class_no: number;
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
}
```

`AdminStudentQuery`에 옵션을 더한다.

```ts
export interface AdminStudentQuery {
  q?: string;
  school?: string;
  grade?: number;
  class_no?: number;
  limit?: number;
  offset?: number;
  sort?: AdminStudentSort;
  // 사진 presigned URL을 받을지. 생략하면 백엔드 기본값(true)이 적용된다.
  // 사진을 쓰지 않는 화면은 false로 보내 서명 비용을 건너뛴다.
  include_photo?: boolean;
}
```

- [ ] **Step 4: fetcher를 추가한다**

`fetchAdminStudents`의 쿼리 조립에 한 줄 더한다(`sort` 다음).

```ts
  if (params.sort) sp.set("sort", params.sort);
  if (params.include_photo != null) sp.set("include_photo", String(params.include_photo));
```

`fetchAdminSchools` 뒤에 추가한다.

```ts
export function fetchAdminClassProgress(
  token: string,
  school: string
): Promise<AdminClassProgress[]> {
  const qs = new URLSearchParams({ school }).toString();
  return request<AdminClassProgress[]>(`/api/admin/progress/classes?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// 목록을 include_photo=false로 받은 화면이 사진이 필요해진 시점에 1건만 받아온다.
export function fetchAdminStudentPhotoUrl(
  token: string,
  id: string
): Promise<string | null> {
  return request<{ photo_url: string | null }>(
    `/api/admin/students/${id}/photo-url`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.photo_url);
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npm run test`
Expected: PASS

- [ ] **Step 6: 린트와 빌드를 확인한다**

Run: `cd frontend && npm run lint && npm run build`
Expected: 통과. `has_photo`가 필수 필드라 mock 데이터에 타입 에러가 날 수 있는데, 나면 해당 mock에 `has_photo: false`를 추가한다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat: 관리자 반별 집계·사진 URL 단건 API 클라이언트 추가"
```

---

### Task 6: 상세 다이얼로그가 상세 응답의 사진을 쓰도록 전환

**Files:**
- Modify: `frontend/components/admin/StudentDetailDialog.tsx:246-264`

**Interfaces:**
- Consumes: `AdminStudentDetail.photo_url` (백엔드 변경 없음 — 이미 응답에 있다)

이 작업이 Task 7보다 **먼저**여야 한다. Task 7이 `include_photo=false`를 켜면 목록의 `photo_url`이 `null`이 되므로, 그 전에 사진 출처를 옮겨두지 않으면 상세 사진이 깨진다.

- [ ] **Step 1: 사진 블록을 `detail` 기준으로 바꾼다**

`frontend/components/admin/StudentDetailDialog.tsx`의 사진 헤더(248-264번 줄)를 아래로 교체한다.

```tsx
            {/* 사진 헤더 — 목록은 사진 URL을 받지 않으므로 상세 응답에서 읽는다. */}
            <div className="relative flex h-64 items-center justify-center bg-muted">
              {loadingDetail ? (
                <Skeleton className="size-full rounded-none" />
              ) : detail?.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.photo_url}
                  alt={`${student.name} 사진`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              )}
            </div>
```

- [ ] **Step 2: `Skeleton` import를 확인한다**

파일 상단 import에 `Skeleton`이 없으면 추가한다.

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Step 3: 검증을 돌린다**

Run: `cd frontend && npm run lint && npm run build && npm run test`
Expected: 전부 통과

- [ ] **Step 4: 브라우저에서 확인한다**

백엔드(`cd backend && uv run uvicorn app.main:app --reload`)와 프론트(`cd frontend && npm run dev`)를 띄우고 `http://localhost:4000/admin`에서 학생 행을 클릭한다.
Expected: 다이얼로그가 열리고 사진 자리에 스켈레톤이 잠깐 보인 뒤 사진이 뜬다. 사진이 없는 학생은 "사진 없음"이 뜬다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/components/admin/StudentDetailDialog.tsx
git commit -m "refactor: 학생 상세 다이얼로그 사진을 상세 응답에서 읽도록 변경"
```

---

### Task 7: 회원 목록에서 사진 지연 로드

**Files:**
- Modify: `frontend/app/admin/page.tsx:45-51, 56-97, 136-137, 158-164, 219-226, 512-522`

**Interfaces:**
- Consumes: `fetchAdminStudentPhotoUrl`, `AdminStudentItem.has_photo`, `AdminStudentQuery.include_photo` (Task 5)

- [ ] **Step 1: import를 추가한다**

`frontend/app/admin/page.tsx`의 `@/lib/api` import 블록에 `fetchAdminStudentPhotoUrl`을 더한다.

```tsx
import {
  ApiError,
  bulkDeleteAdminStudents,
  fetchAdminSchools,
  fetchAdminStudentPhotoUrl,
  fetchAdminStudents,
  type AdminStudentItem,
} from "@/lib/api";
```

- [ ] **Step 2: `StudentAvatar`가 `has_photo`와 외부 URL을 받도록 바꾼다**

`function StudentAvatar({` 로 시작하는 컴포넌트 전체를 아래로 교체한다(Step 1에서 import를 늘렸으므로 줄 번호가 아니라 함수 이름으로 찾는다).

```tsx
function StudentAvatar({
  student,
  revealed,
  photoUrl,
  onToggle,
}: {
  student: AdminStudentItem;
  revealed: boolean;
  // 펼친 뒤 따로 받아온 presigned URL. 아직 로딩 중이면 null.
  photoUrl: string | null;
  onToggle: () => void;
}) {
  if (!student.has_photo) {
    return (
      <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border">
        {student.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={revealed ? `${student.name} 사진 숨기기` : `${student.name} 사진 보기`}
      className="group relative block size-10 overflow-hidden rounded-full ring-1 ring-border"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {revealed && photoUrl ? (
        // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={student.name}
          className="size-full object-cover"
        />
      ) : revealed ? (
        // 펼쳤지만 URL이 아직 안 온 상태.
        <Skeleton className="size-full rounded-full" />
      ) : (
        <span className="grid size-full place-items-center bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <ImageIcon className="size-4" aria-hidden />
        </span>
      )}
    </button>
  );
}
```

파일 상단 import에 `Skeleton`이 없으면 `import { Skeleton } from "@/components/ui/skeleton";`을 추가한다.

- [ ] **Step 3: URL 캐시 상태를 추가한다**

`const [photoRevealed, setPhotoRevealed] = useState<Set<string>>(new Set());` 바로 아래에 추가한다.

```tsx
  // 펼친 학생의 사진 URL 캐시. 목록이 사진을 안 받으므로 클릭 시점에 1건씩 받는다.
  const [photoUrls, setPhotoUrls] = useState<Map<string, string | null>>(new Map());
```

- [ ] **Step 4: 목록 조회에 `include_photo: false`를 넣는다**

`loadStudents` 안의 `fetchAdminStudents` 호출을 바꾼다.

```tsx
      const res = await fetchAdminStudents(token, {
        q: submittedQuery || undefined,
        school: schoolFilter === ALL_SCHOOLS ? undefined : schoolFilter,
        sort: sortKey,
        limit: pageSize,
        offset: page * pageSize,
        // 아바타는 클릭해야 보이므로 목록에서는 사진을 받지 않는다(서명 50건 절약).
        include_photo: false,
      });
```

- [ ] **Step 5: `togglePhoto`가 필요할 때 URL을 받아오게 한다**

`function togglePhoto(id: string) {` 전체를 아래로 교체한다. 이름이 비슷한 `toggleReveal`(비밀번호)·`toggleCheck`(체크박스)와 헷갈리지 않게 주의한다.

```tsx
  function togglePhoto(id: string) {
    setPhotoRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // 처음 펼치는 학생만 URL을 받아온다. 이미 받았으면 캐시를 쓴다.
    if (photoRevealed.has(id) || photoUrls.has(id)) return;
    const token = getAdminToken();
    if (!token) return;
    fetchAdminStudentPhotoUrl(token, id)
      .then((url) => setPhotoUrls((prev) => new Map(prev).set(id, url)))
      .catch(() => setPhotoUrls((prev) => new Map(prev).set(id, null)));
  }
```

- [ ] **Step 6: 렌더에서 URL을 넘긴다**

테이블 본문의 `<StudentAvatar` 사용부(JSX)를 바꾼다.

```tsx
                      <StudentAvatar
                        student={s}
                        revealed={photoRevealed.has(s.id)}
                        photoUrl={photoUrls.get(s.id) ?? null}
                        onToggle={() => togglePhoto(s.id)}
                      />
```

- [ ] **Step 7: 검증을 돌린다**

Run: `cd frontend && npm run lint && npm run build && npm run test`
Expected: 전부 통과

- [ ] **Step 8: 브라우저에서 확인한다**

`http://localhost:4000/admin`을 연다.
Expected:
- 목록이 눈에 띄게 빨리 뜬다(사진 서명 50건이 사라짐)
- 사진이 있는 학생은 아이콘 아바타, 없는 학생은 이니셜
- 아바타를 클릭하면 스켈레톤이 잠깐 뜬 뒤 사진이 나온다
- 다시 클릭해 접었다 펴면 재요청 없이 즉시 나온다(캐시)

- [ ] **Step 9: 커밋**

```bash
git add frontend/app/admin/page.tsx
git commit -m "perf: 관리자 회원 목록 사진을 클릭 시점에만 불러오도록 변경"
```

---

### Task 8: 좌석표를 집계 + 반 단위 조회로 재구성

**Files:**
- Modify: `frontend/app/admin/seating/page.tsx:9-17, 87-206, 224-281, 289-318, 383-391`

**Interfaces:**
- Consumes: `fetchAdminClassProgress`, `AdminClassProgress`, `AdminStudentQuery.include_photo` (Task 5)

- [ ] **Step 1: import를 바꾼다**

9-17번 줄의 import 블록을 아래로 교체한다.

```tsx
import {
  ApiError,
  fetchAdminClassProgress,
  fetchAdminSchools,
  fetchAdminStudents,
  type AdminClassProgress,
  type AdminProgressStatus,
  type AdminStudentItem,
} from "@/lib/api";
```

- [ ] **Step 2: 상태와 로딩 로직을 교체한다**

`AdminSeatingPage` 안의 `const [schools, setSchools] = useState<string[]>([]);` 줄부터 `const missing = maxNo - registered;` 줄까지를 통째로 아래로 교체한다(Step 1에서 import 줄 수가 바뀌었으므로 코드 내용으로 찾는다).

```tsx
  const [schools, setSchools] = useState<string[]>([]);
  const [school, setSchool] = useState<string>("");
  // 학교의 반별 집계 — 학년·반 목록과 완료 배지의 유일한 출처다.
  // 학생 전원을 받아 역산하던 것을 이 한 번의 호출로 대체한다.
  const [classProgress, setClassProgress] = useState<AdminClassProgress[]>([]);
  // 선택한 반의 학생만 담는다. 사진은 받지 않는다(격자가 쓰지 않음).
  const [classStudents, setClassStudents] = useState<AdminStudentItem[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [classNo, setClassNo] = useState<number | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);

  // 학교 목록 로드 — 마운트 시 1회.
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    fetchAdminSchools(token)
      .then((list) => {
        setSchools(list);
        // 학교가 하나도 없으면 집계 로드가 일어나지 않으므로 여기서 로딩 종료.
        if (list.length === 0) setLoadingClasses(false);
      })
      .catch(() => {
        setSchools([]);
        setLoadingClasses(false);
      });
  }, [router]);

  const loadClassProgress = useCallback(
    async (target: string) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      setLoadingClasses(true);
      // 이전 학교의 집계·학생이 남아 있으면 새 학교 + 옛 반 조합으로 헛요청이 나간다.
      setClassProgress([]);
      setClassStudents([]);
      try {
        setClassProgress(await fetchAdminClassProgress(token, target));
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setClassProgress([]);
        setError(
          err instanceof ApiError ? err.message : "진행 현황을 불러오지 못했습니다."
        );
      } finally {
        setLoadingClasses(false);
      }
    },
    [router]
  );

  const loadClassStudents = useCallback(
    async (target: string, g: number, c: number) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      setLoadingStudents(true);
      try {
        const res = await fetchAdminStudents(token, {
          school: target,
          grade: g,
          class_no: c,
          // 한 반 정원을 넉넉히 덮는다. 좌석표는 반 단위라 페이지네이션이 필요 없다.
          limit: 100,
          sort: "name_asc",
          // 격자는 번호·이름·상태만 그린다 — 사진 서명은 낭비다.
          include_photo: false,
        });
        setClassStudents(res.items);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setClassStudents([]);
        setError(
          err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."
        );
      } finally {
        setLoadingStudents(false);
      }
    },
    [router]
  );

  // 학교가 정해지면(첫 로드 시 자동) 집계를 불러온다.
  useEffect(() => {
    if (school) loadClassProgress(school);
  }, [school, loadClassProgress]);

  useEffect(() => {
    // 학교 목록이 오면 첫 학교를 자동 선택.
    if (schools.length > 0 && !school) setSchool(schools[0]);
  }, [schools, school]);

  const grades = useMemo(
    () => [...new Set(classProgress.map((r) => r.grade))].sort((a, b) => a - b),
    [classProgress]
  );
  const classRows = useMemo(
    () =>
      classProgress
        .filter((r) => r.grade === grade)
        .sort((a, b) => a.class_no - b.class_no),
    [classProgress, grade]
  );

  // 학년·반 선택값을 항상 유효 범위로 보정한다.
  useEffect(() => {
    if (grades.length > 0 && (grade === null || !grades.includes(grade))) {
      setGrade(grades[0]);
    }
  }, [grades, grade]);
  useEffect(() => {
    const nos = classRows.map((r) => r.class_no);
    if (nos.length > 0 && (classNo === null || !nos.includes(classNo))) {
      setClassNo(nos[0]);
    }
  }, [classRows, classNo]);

  // 학교·학년·반이 모두 정해지면 그 반의 학생만 불러온다.
  useEffect(() => {
    if (school && grade !== null && classNo !== null) {
      loadClassStudents(school, grade, classNo);
    }
  }, [school, grade, classNo, loadClassStudents]);

  const byNo = useMemo(() => {
    const map = new Map<number, AdminStudentItem>();
    classStudents.forEach((s) => map.set(s.student_no, s));
    return map;
  }, [classStudents]);

  const maxNo = classStudents.reduce((m, s) => Math.max(m, s.student_no), 0);
  const numbers = Array.from({ length: maxNo }, (_, i) => i + 1);

  // 요약 숫자는 집계 행에서 그대로 읽는다(학생 배열을 세지 않는다).
  const current = useMemo(
    () => classRows.find((r) => r.class_no === classNo) ?? null,
    [classRows, classNo]
  );
  const registered = current?.total ?? 0;
  const counts = {
    completed: current?.completed ?? 0,
    in_progress: current?.in_progress ?? 0,
    not_started: current?.not_started ?? 0,
  };
  const missing = maxNo - registered;
```

- [ ] **Step 3: 선택 카드가 집계를 쓰도록 바꾼다**

`{grades.length > 0 && (` 로 시작하는 학년 그룹부터 그 아래 반 그룹 끝까지를 아래로 교체한다. **학교 그룹(`<PickerGroup label="학교">`)은 그대로 둔다.**

```tsx
          {grades.length > 0 && (
            <PickerGroup label="학년">
              {grades.map((g) => (
                <PickerCard
                  key={g}
                  selected={g === grade}
                  onClick={() => setGrade(g)}
                >
                  {g}학년
                </PickerCard>
              ))}
            </PickerGroup>
          )}

          {classRows.length > 0 && (
            <PickerGroup label="반">
              {classRows.map((r) => (
                <PickerCard
                  key={r.class_no}
                  selected={r.class_no === classNo}
                  onClick={() => setClassNo(r.class_no)}
                >
                  <span className="flex items-center gap-2">
                    {r.class_no}반
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {r.completed}/{r.total}
                    </span>
                  </span>
                </PickerCard>
              ))}
            </PickerGroup>
          )}
```

- [ ] **Step 4: 격자의 로딩·빈 상태 조건을 바꾼다**

`{/* 좌석표 격자 */}` 주석 아래의 블록에서 `loading`을 `loadingStudents`로, 빈 상태 판정을 집계 기준으로 바꾼다(Step 2·3에서 줄 번호가 밀렸으므로 주석을 기준으로 찾는다).

```tsx
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          {loadingStudents || loadingClasses ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : maxNo === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              {classProgress.length === 0 ? (
                <School className="size-8" aria-hidden />
              ) : (
                <Inbox className="size-8" aria-hidden />
              )}
              <p className="text-sm">
                {classProgress.length === 0
                  ? "해당 학교에 가입한 학생이 없습니다."
                  : "이 반에 가입한 학생이 없습니다."}
              </p>
            </div>
          ) : (
```

- [ ] **Step 5: 삭제 후 재조회를 집계 + 현재 반 둘 다로 바꾼다**

파일 끝의 `<StudentDetailDialog` 사용부를 바꾼다.

```tsx
      <StudentDetailDialog
        student={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          // 집계와 현재 반을 모두 갱신해야 배지와 격자가 함께 맞는다.
          if (school) loadClassProgress(school);
          if (school && grade !== null && classNo !== null) {
            loadClassStudents(school, grade, classNo);
          }
        }}
      />
```

- [ ] **Step 6: 검증을 돌린다**

Run: `cd frontend && npm run lint && npm run build && npm run test`
Expected: 전부 통과. 미사용 변수 경고가 나면(예전 `loading`, `students`, `classes`, `classStudents` useMemo 잔재) 제거한다.

- [ ] **Step 7: 브라우저에서 동작과 성능을 확인한다**

`http://localhost:4000/admin/seating`을 열고 DevTools Network 탭을 연다.
Expected:
- 진입 시 `GET /api/admin/students/schools` 1건, `GET /api/admin/progress/classes?school=...` 1건. **학생 목록 요청은 없다.**
- 집계 응답이 3 KB 안팎이고 수백 ms 안에 끝난다(기존 31초 → 개선 확인)
- 학년·반 카드가 뜨고 반 배지에 `완료/총원`이 보인다
- 반을 클릭할 때마다 `GET /api/admin/students?...&grade=..&class_no=..&include_photo=false` 1건이 나가고 응답에 `photo_url`이 전부 `null`이다
- 격자의 번호·이름·색상이 기존과 동일하다
- 셀을 클릭하면 상세 다이얼로그가 열리고 사진이 뜬다(Task 6 덕분)
- 학교를 바꾸면 집계만 다시 나간다

- [ ] **Step 8: 커밋**

```bash
git add frontend/app/admin/seating/page.tsx
git commit -m "perf: 좌석표를 반별 집계와 반 단위 학생 조회로 재구성"
```

---

### Task 9: 문서 갱신

**Files:**
- Modify: `docs/2026-07-31-admin-api-usage.md`
- Modify: `docs/2026-07-31-external-admin-api-guide.md`

**Interfaces:**
- Consumes: Task 2·3·4가 추가한 파라미터와 엔드포인트

외부 전달용 문서라 신규 필드·파라미터를 반영해야 한다. **기존 동작 설명은 바꾸지 않는다** — 기본값이 그대로이므로 기존 사용법은 유효하다.

- [ ] **Step 1: 필드 표에 `has_photo`를 추가한다**

`docs/2026-07-31-admin-api-usage.md`의 필드 표(197번 줄 `photo_url` 행 근처)에 추가한다.

```markdown
| `has_photo`       | boolean        | 사진 보유 여부. `include_photo=false`로 받아 `photo_url`이 `null`이어도 유효 |
```

- [ ] **Step 2: `include_photo` 파라미터를 문서화한다**

같은 문서의 쿼리 파라미터 설명에 추가한다.

```markdown
| `include_photo` | boolean | `true` | `false`면 `photo_url`을 서명하지 않고 `null`로 내려준다. 사진이 필요 없으면 응답이 크게 빨라진다(832명 기준 31초 → 0.5초) |
```

- [ ] **Step 3: 신규 엔드포인트 2개를 문서화한다**

같은 문서에 절을 추가한다.

```markdown
## 반별 진행 현황 집계

    GET /api/admin/progress/classes?school=<학교명>

학생 개인정보 없이 (학년, 반)별 카운트만 반환한다. 학생 명단을 받지 않고 진행률만
확인할 때 쓴다.

    [{ "grade": 1, "class_no": 1, "total": 32,
       "completed": 18, "in_progress": 5, "not_started": 9 }, ...]

`completed + in_progress + not_started == total`이 항상 성립한다.

## 학생 사진 URL 1건

    GET /api/admin/students/{student_id}/photo-url
    → { "photo_url": "https://...", }

목록을 `include_photo=false`로 받은 뒤 특정 학생의 사진만 필요할 때 쓴다.
사진이 없으면 `photo_url`은 `null`(200), 학생이 없으면 404다.
```

- [ ] **Step 4: 변경 이력을 갱신한다**

두 문서 하단의 변경 이력 표에 행을 추가한다.

```markdown
| 2026-08-01 | `include_photo` 파라미터와 `has_photo` 필드 추가, 반별 집계·사진 단건 엔드포인트 추가. 기존 동작·기본값은 그대로 |
```

- [ ] **Step 5: 커밋**

```bash
git add docs/2026-07-31-admin-api-usage.md docs/2026-07-31-external-admin-api-guide.md
git commit -m "docs: 관리자 API에 include_photo·반별 집계·사진 단건 엔드포인트 반영"
```

---

## 최종 검증

- [ ] **백엔드 전체 검증**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest
```

- [ ] **프론트엔드 전체 검증**

```bash
cd frontend && npm run lint && npm run build && npm run test
```

- [ ] **외부 계약 회귀 확인**

`backend/tests/test_export_students_script.py`가 **수정 없이** 통과했는지 확인한다. 이 테스트가 `photo_url` 기반 사진 수집 흐름을 덮고 있어, 통과한다는 것은 외부 API 계약이 유지됐다는 뜻이다.

```bash
cd backend && uv run pytest tests/test_export_students_script.py -v
```

- [ ] **실측으로 개선을 확인한다**

좌석표에서 최대 학교를 선택하고 DevTools Network에서 확인한다.

| 항목 | 기대 |
|---|---|
| `progress/classes` 응답 시간 | 1초 미만 (기존 학생 전원 로드는 31.5초) |
| `progress/classes` 응답 크기 | 5 KB 미만 |
| 진입 시 학생 목록 요청 | 없음 |
| 반 클릭 시 학생 응답 | 1초 미만, `photo_url`이 전부 `null` |

## 범위 밖 (이 계획에서 하지 않는다)

- 좌석표 프론트엔드 캐시(같은 반 재방문 시 stale-while-revalidate) — 진행도가 계속 변하는 화면이라 신중히 설계해야 하고, 지금 병목이 아니다
- 좌석표 자동 갱신/폴링
- `GET /api/admin/students`의 `limit` 상한 검증 (외부 가이드에 이미 리스크로 기록됨)
- 외부 API 소비자를 위한 반별 집계 노출 정책
