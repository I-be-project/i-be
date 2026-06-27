# 관리자 회원 조회 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 별도 로그인 후 회원가입한 모든 학생의 정보(사진 포함)를 테이블로 조회·검색하는 화면을 만든다.

**Architecture:** 백엔드는 `.env` 단일 관리자 계정으로 admin JWT(`kind=admin`)를 발급하고, `AdminService`가 `StudentRepository.list_students` + `StorageClient.create_signed_url`로 학생 목록과 사진 presigned URL을 반환한다. 프론트는 `/admin/login`(토큰 발급)과 `/admin`(테이블+썸네일+검색/필터+상세 모달)을 추가하고 `localStorage["admin_token"]`로 가드한다.

**Tech Stack:** FastAPI · asyncpg · PyJWT · pytest (백엔드) / Next.js 16 App Router · TypeScript · Tailwind 4 · shadcn/ui · Lucide (프론트)

## Global Constraints

- 비밀번호는 평문 저장·반환 — 프론트에서 기본 가림. 정책상 해시하지 않음.
- 학생 사진은 영구 보관 — 조회만 하고 삭제·폐기하지 않는다.
- 비밀번호·사진 presigned URL은 admin 토큰 검증 통과 요청에만 응답.
- soft-delete(`deleted_at IS NOT NULL`) 레코드는 조회 대상에서 제외.
- 백엔드 에러는 `DomainError`/`UnauthorizedError`, 프론트는 `ApiError`/`parseErrorMessage`로 통일.
- 프론트 UI 텍스트는 한국어. shadcn/ui는 base-nova 프리셋, 아이콘은 Lucide.
- **Next.js 16 주의:** 프론트 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 확인할 것(학습 데이터와 API 상이 가능).
- 테스트 패턴: 백엔드는 `httpx.ASGITransport` + `app.dependency_overrides` + FakeRepo/FakeStorage(실 DB·S3 없음). 프론트는 테스트 러너가 없으므로 `npm run lint` + `npm run build` + 수동 확인으로 검증.

---

## File Structure

**백엔드 (create/modify):**
- Modify `backend/app/config.py` — 관리자 계정 설정 3개 추가
- Create `backend/app/schemas/admin.py` — 관리자 요청/응답 스키마
- Create `backend/app/services/admin_service.py` — 인증·목록 로직
- Modify `backend/app/repositories/student_repo.py` — `list_students` 추가
- Modify `backend/app/deps.py` — `current_admin`, `get_admin_service` 의존성
- Modify `backend/app/routers/admin.py` — `POST /login`, `GET /students`
- Create `backend/tests/test_admin_service.py` — 서비스 단위 테스트
- Create `backend/tests/test_admin_router.py` — 라우터 통합 테스트

**프론트 (create/modify):**
- Modify `frontend/lib/api.ts` — `adminLogin`, `fetchAdminStudents` + 타입
- Create `frontend/lib/adminAuth.ts` — admin 토큰 localStorage 헬퍼
- Create `frontend/app/admin/login/page.tsx` — 관리자 로그인
- Create `frontend/app/admin/layout.tsx` — 토큰 가드
- Create `frontend/app/admin/page.tsx` — 회원 목록 화면
- Create `frontend/components/admin/StudentDetailDialog.tsx` — 상세 모달
- Add shadcn `table`, `dialog` 컴포넌트

---

## Task 1: 관리자 인증 (config + login + current_admin)

**Files:**
- Modify: `backend/app/config.py` (Auth 섹션, `share_link_ttl_hours` 아래)
- Create: `backend/app/schemas/admin.py`
- Create: `backend/app/services/admin_service.py`
- Modify: `backend/app/deps.py`
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_router.py`

**Interfaces:**
- Produces:
  - `Settings.admin_username: str`, `Settings.admin_password: str`, `Settings.admin_token_ttl_hours: int`
  - `AdminLoginRequest { username: str, password: str }`, `AdminLoginResponse { admin_token: str }`
  - `AdminService(*, students, storage, settings)` with `authenticate(self, username: str, password: str) -> str` (returns admin JWT; raises `UnauthorizedError`)
  - `current_admin(...) -> str` (returns username), `CurrentAdminDep = Annotated[str, Depends(current_admin)]`
  - `get_admin_service(...) -> AdminService`, `AdminServiceDep`
  - `POST /api/admin/login` → `AdminLoginResponse`

- [ ] **Step 1: config에 관리자 설정 추가**

`backend/app/config.py`의 Auth 섹션, `share_link_ttl_hours: int = 24` 아래에 추가:

```python
    # 관리자(단일 계정) — 운영 배포 시 .env로 주입.
    admin_username: str = "admin"
    admin_password: str = "change-me-admin"
    admin_token_ttl_hours: int = 12
```

- [ ] **Step 2: 관리자 스키마 생성**

`backend/app/schemas/admin.py` 생성:

```python
"""admin 라우터용 Request/Response 모델."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    admin_token: str = Field(..., description="관리자 세션 JWT (Bearer)")
```

- [ ] **Step 3: AdminService 생성 (authenticate)**

`backend/app/services/admin_service.py` 생성. (`list_students`는 Task 2에서 추가):

```python
"""관리자 인증·조회 서비스."""

from __future__ import annotations

import secrets
from datetime import timedelta

from app.adapters.storage_client import StorageClient
from app.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, create_token
from app.repositories.student_repo import StudentRepository


class AdminService:
    def __init__(
        self,
        *,
        students: StudentRepository,
        storage: StorageClient,
        settings: Settings,
    ) -> None:
        self._students = students
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
```

- [ ] **Step 4: deps에 admin 의존성 추가**

`backend/app/deps.py`에 추가. import에 `AdminService`를 더하고(`from app.services.admin_service import AdminService`), `CurrentStudentDep` 아래에 추가:

```python
def get_admin_service(
    students: StudentRepoDep,
    storage: StorageClientDep,
    settings: SettingsDep,
) -> AdminService:
    return AdminService(students=students, storage=storage, settings=settings)


AdminServiceDep = Annotated[AdminService, Depends(get_admin_service)]


def current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> str:
    """Authorization: Bearer <token>를 관리자 토큰으로 검증하고 username 반환."""
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    try:
        payload = decode_token(
            credentials.credentials,
            expected_kind=TokenKind.ADMIN,
            settings=settings,
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("유효하지 않은 토큰입니다.") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise UnauthorizedError("토큰에 관리자 식별자가 없습니다.")
    return subject


CurrentAdminDep = Annotated[str, Depends(current_admin)]
```

- [ ] **Step 5: admin 라우터에 login 추가**

`backend/app/routers/admin.py`의 `dashboard` 위에, import와 엔드포인트를 추가. 파일 상단 import를 다음으로 교체:

```python
from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminServiceDep
from app.schemas.admin import AdminLoginRequest, AdminLoginResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminLoginResponse)
async def login(req: AdminLoginRequest, admin: AdminServiceDep) -> AdminLoginResponse:
    """관리자 단일 계정 로그인 → admin 세션 토큰 발급."""
    return AdminLoginResponse(admin_token=admin.authenticate(req.username, req.password))
```

(기존 `dashboard`/`keyword_stats`/`list_operators` stub은 그대로 둔다.)

- [ ] **Step 6: 로그인 통합 테스트 작성 (실패 확인용)**

`backend/tests/test_admin_router.py` 생성:

```python
"""/api/admin 통합 테스트 — fake 저장소/스토리지 주입, 실 DB·S3 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.config import get_settings
from app.deps import get_admin_service
from app.main import create_app
from app.services.admin_service import AdminService
from tests.test_auth_service import FakeStorage, FakeStudentRepo


def _build() -> tuple[object, FakeStudentRepo, FakeStorage]:
    repo = FakeStudentRepo()
    storage = FakeStorage()
    service = AdminService(students=repo, storage=storage, settings=get_settings())
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: service
    return app, repo, storage


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_login_success_returns_admin_token() -> None:
    settings = get_settings()
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert res.status_code == 200, res.text
        assert res.json()["admin_token"]
    finally:
        await gen.aclose()


async def test_login_wrong_credentials_unauthorized() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "definitely-wrong"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()
```

- [ ] **Step 7: 테스트 실행 — 실패 확인**

Run: `cd backend && uv run pytest tests/test_admin_router.py -v`
Expected: 임포트/엔드포인트 미비로 수집 또는 어서션 실패. (Step 1~5를 먼저 적용했다면 바로 통과할 수 있음 — 그 경우 다음 단계로.)

- [ ] **Step 8: 테스트 실행 — 통과 확인**

Run: `cd backend && uv run pytest tests/test_admin_router.py -v`
Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add backend/app/config.py backend/app/schemas/admin.py \
  backend/app/services/admin_service.py backend/app/deps.py \
  backend/app/routers/admin.py backend/tests/test_admin_router.py
git commit -m "feat(admin): add admin login and admin-token dependency"
```
(git 미초기화 상태면 이 단계는 건너뛴다.)

---

## Task 2: 회원 목록 조회 (repo + service)

**Files:**
- Modify: `backend/app/repositories/student_repo.py` (`list_students` 추가)
- Modify: `backend/app/schemas/admin.py` (학생 항목 스키마 추가)
- Modify: `backend/app/services/admin_service.py` (`list_students` 추가)
- Modify: `backend/tests/test_auth_service.py` (FakeStudentRepo/FakeStorage 확장)
- Test: `backend/tests/test_admin_service.py`

**Interfaces:**
- Consumes: `AdminService.__init__`, `StudentRecord`, `StorageClient.create_signed_url`
- Produces:
  - `StudentRepository.list_students(self, *, q: str | None, school: str | None, grade: int | None, class_no: int | None, limit: int, offset: int) -> tuple[int, list[StudentRecord]]` (returns `(total, records)`)
  - `AdminStudentItem`, `AdminStudentList { total: int, items: list[AdminStudentItem] }`
  - `AdminService.list_students(self, *, q, school, grade, class_no, limit, offset) -> AdminStudentList` (async)

- [ ] **Step 1: 학생 항목 스키마 추가**

`backend/app/schemas/admin.py` 끝에 추가:

```python
from datetime import datetime
from uuid import UUID


class AdminStudentItem(BaseModel):
    id: UUID
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str
    password: str = Field(..., description="평문 비밀번호 — 관리자 전용 노출")
    photo_url: str | None = Field(None, description="사진 presigned URL (없으면 null)")
    consent_privacy: bool
    created_at: datetime


class AdminStudentList(BaseModel):
    total: int
    items: list[AdminStudentItem]
```

(파일 상단의 기존 import에 `datetime`, `UUID`가 없으므로 위 두 import 줄을 파일 상단 import 영역으로 옮겨도 무방하다.)

- [ ] **Step 2: 레포에 list_students 추가**

`backend/app/repositories/student_repo.py`의 `update_photo_key` 아래(soft_delete 위)에 추가:

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
    ) -> tuple[int, list[StudentRecord]]:
        """관리자용 목록 — soft-delete 제외, 필터 AND 결합, (학교,학년,반,번호) 정렬.

        반환: (조건에 맞는 전체 개수, 현재 페이지 레코드 목록).
        """
        conditions = ["deleted_at is null"]
        params: list[object] = []

        def _add(expr: str, value: object) -> None:
            params.append(value)
            conditions.append(expr.format(n=len(params)))

        if q:
            _add("name ilike '%' || ${n} || '%'", q)
        if school:
            _add("school = ${n}", school)
        if grade is not None:
            _add("grade = ${n}", grade)
        if class_no is not None:
            _add("class_no = ${n}", class_no)

        where = " and ".join(conditions)
        count_query = f"select count(*) from pii.students where {where}"
        list_query = f"""
            select {_COLUMNS}
            from pii.students
            where {where}
            order by school, grade, class_no, student_no
            limit ${len(params) + 1} offset ${len(params) + 2}
        """
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(count_query, *params)
            rows = await conn.fetch(list_query, *params, limit, offset)
        return int(total), [_to_record(row) for row in rows]
```

- [ ] **Step 3: AdminService에 list_students 추가**

`backend/app/services/admin_service.py`의 `AdminService` 클래스에 메서드 추가. 상단 import에 스키마를 더한다(`from app.schemas.admin import AdminStudentItem, AdminStudentList`):

```python
    # 사진 presigned URL 유효시간 (1시간) — 관리자 조회 세션에 충분.
    _PHOTO_URL_TTL_SECONDS = 3600

    async def list_students(
        self,
        *,
        q: str | None,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        limit: int,
        offset: int,
    ) -> AdminStudentList:
        total, records = await self._students.list_students(
            q=q, school=school, grade=grade, class_no=class_no, limit=limit, offset=offset
        )
        items: list[AdminStudentItem] = []
        for r in records:
            photo_url: str | None = None
            if r.photo_key:
                try:
                    photo_url = await self._storage.create_signed_url(
                        r.photo_key, ttl_seconds=self._PHOTO_URL_TTL_SECONDS
                    )
                except Exception:  # noqa: BLE001 — 사진 1건 실패가 목록 전체를 막지 않도록.
                    photo_url = None
            items.append(
                AdminStudentItem(
                    id=r.id,
                    school=r.school,
                    grade=r.grade,
                    class_no=r.class_no,
                    student_no=r.student_no,
                    name=r.name,
                    password=r.password,
                    photo_url=photo_url,
                    consent_privacy=r.consent_privacy,
                    created_at=r.created_at,
                )
            )
        return AdminStudentList(total=total, items=items)
```

- [ ] **Step 4: Fake 저장소/스토리지 확장**

`backend/tests/test_auth_service.py`의 `FakeStudentRepo`에 메서드 추가:

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
```

`FakeStorage`에 메서드 추가:

```python
    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        return f"https://signed.example/{key}?ttl={ttl_seconds}"
```

- [ ] **Step 5: 서비스 단위 테스트 작성 (실패 확인용)**

`backend/tests/test_admin_service.py` 생성:

```python
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
```

(참고: 다른 테스트가 `anyio_backend`를 제공하는지 확인. 기존 async 테스트가 마커 없이 도는 점으로 보아 `pyproject.toml`에 `asyncio_mode = "auto"` 또는 anyio 설정이 있을 것이다. 그 경우 위 `pytestmark` 줄은 제거한다 — Step 6에서 조정.)

- [ ] **Step 6: 테스트 실행 — 실패 확인**

Run: `cd backend && uv run pytest tests/test_admin_service.py -v`
Expected: FAIL (구현 전이면 어서션/임포트 실패).

- [ ] **Step 7: 테스트 실행 — 통과 확인**

Run: `cd backend && uv run pytest tests/test_admin_service.py tests/test_auth_service.py -v`
Expected: 신규 4 passed, 기존 auth 테스트도 그대로 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/repositories/student_repo.py backend/app/schemas/admin.py \
  backend/app/services/admin_service.py backend/tests/test_auth_service.py \
  backend/tests/test_admin_service.py
git commit -m "feat(admin): list students with photo presigned urls"
```

---

## Task 3: 회원 목록 엔드포인트 + 인증 가드

**Files:**
- Modify: `backend/app/routers/admin.py` (`GET /students`)
- Test: `backend/tests/test_admin_router.py` (확장)

**Interfaces:**
- Consumes: `CurrentAdminDep`, `AdminServiceDep`, `AdminStudentList`
- Produces: `GET /api/admin/students?q&school&grade&class_no&limit&offset` → `AdminStudentList` (admin 토큰 필수)

- [ ] **Step 1: 엔드포인트 추가**

`backend/app/routers/admin.py`의 import와 `login` 아래에 추가. import 영역을 다음으로 보강:

```python
from app.deps import AdminServiceDep, CurrentAdminDep
from app.schemas.admin import AdminLoginRequest, AdminLoginResponse, AdminStudentList
```

`login` 함수 아래에 추가:

```python
@router.get("/students", response_model=AdminStudentList)
async def list_students(
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
    q: str | None = None,
    school: str | None = None,
    grade: int | None = None,
    class_no: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminStudentList:
    """가입한 모든 학생 목록 — 검색/필터/페이지네이션, 사진 presigned URL 포함."""
    return await admin.list_students(
        q=q, school=school, grade=grade, class_no=class_no, limit=limit, offset=offset
    )
```

- [ ] **Step 2: 라우터 테스트 확장 (실패 확인용)**

`backend/tests/test_admin_router.py`에 추가. 상단에 헬퍼 import 보강(`from app.core.security import TokenKind, create_token`), 그리고:

```python
def _admin_token() -> str:
    settings = get_settings()
    from datetime import timedelta

    return create_token(
        kind=TokenKind.ADMIN, subject="admin",
        ttl=timedelta(hours=1), settings=settings,
    )


async def test_students_requires_admin_token() -> None:
    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/students")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_rejects_student_token() -> None:
    from datetime import timedelta

    app, _, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        student_tok = create_token(
            kind=TokenKind.STUDENT, subject="00000000-0000-0000-0000-000000000000",
            ttl=timedelta(hours=1), settings=get_settings(),
        )
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {student_tok}"},
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_students_lists_with_admin_token() -> None:
    app, repo, _ = _build()
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", consent_privacy=True,
    )
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/students",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "홍길동"
        assert body["items"][0]["password"] == "20100101"
    finally:
        await gen.aclose()
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `cd backend && uv run pytest tests/test_admin_router.py -v`
Expected: 신규 3건 중 일부 FAIL(엔드포인트 추가 전이면 404/수집 실패).

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd backend && uv run pytest tests/test_admin_router.py -v`
Expected: 5 passed (login 2 + students 3).

- [ ] **Step 5: 전체 백엔드 테스트로 회귀 확인**

Run: `cd backend && uv run pytest -q`
Expected: 전체 passed (기존 + 신규).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_router.py
git commit -m "feat(admin): GET /api/admin/students endpoint with admin guard"
```

---

## Task 4: 프론트 API 클라이언트 + 토큰 헬퍼

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/adminAuth.ts`

**Interfaces:**
- Produces:
  - `adminLogin(username: string, password: string): Promise<AdminLoginResponse>` where `AdminLoginResponse { admin_token: string }`
  - `fetchAdminStudents(token: string, params: AdminStudentQuery): Promise<AdminStudentList>`
  - 타입 `AdminStudentItem`, `AdminStudentList { total: number; items: AdminStudentItem[] }`, `AdminStudentQuery`
  - `lib/adminAuth.ts`: `getAdminToken(): string | null`, `setAdminToken(t: string): void`, `clearAdminToken(): void` (key `"admin_token"`)

- [ ] **Step 1: api.ts에 타입·함수 추가**

`frontend/lib/api.ts` 끝에 추가:

```typescript
export interface AdminLoginResponse {
  admin_token: string;
}

export interface AdminStudentItem {
  id: string;
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
  name: string;
  password: string;
  photo_url: string | null;
  consent_privacy: boolean;
  created_at: string;
}

export interface AdminStudentList {
  total: number;
  items: AdminStudentItem[];
}

export interface AdminStudentQuery {
  q?: string;
  school?: string;
  grade?: number;
  class_no?: number;
  limit?: number;
  offset?: number;
}

export function adminLogin(
  username: string,
  password: string
): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function fetchAdminStudents(
  token: string,
  params: AdminStudentQuery = {}
): Promise<AdminStudentList> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.school) sp.set("school", params.school);
  if (params.grade != null) sp.set("grade", String(params.grade));
  if (params.class_no != null) sp.set("class_no", String(params.class_no));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return request<AdminStudentList>(
    `/api/admin/students${qs ? `?${qs}` : ""}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } }
  );
}
```

- [ ] **Step 2: 토큰 헬퍼 생성**

`frontend/lib/adminAuth.ts` 생성:

```typescript
// 관리자 토큰 localStorage 헬퍼. 학생 토큰과 키를 분리한다.
const ADMIN_TOKEN_KEY = "admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}
```

- [ ] **Step 3: 빌드·린트 검증**

Run: `cd frontend && npm run lint && npm run build`
Expected: 타입 에러·린트 에러 없이 성공.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/adminAuth.ts
git commit -m "feat(admin-web): admin api client and token helpers"
```

---

## Task 5: 관리자 로그인 페이지 + 가드 레이아웃

**Files:**
- Create: `frontend/app/admin/login/page.tsx`
- Create: `frontend/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `adminLogin`, `ApiError` (`@/lib/api`), `setAdminToken`/`getAdminToken` (`@/lib/adminAuth`)
- Produces: `/admin/login` 화면; `/admin/*` 가드(`/admin/login` 제외)

작성 전 `node_modules/next/dist/docs/`에서 App Router layout/`usePathname`/`useRouter` 관련 가이드를 확인할 것.

- [ ] **Step 1: 가드 레이아웃 생성**

`frontend/app/admin/layout.tsx` 생성:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminToken } from "@/lib/adminAuth";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setReady(true);
      return;
    }
    if (!getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  if (!ready) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: 로그인 페이지 생성**

`frontend/app/admin/login/page.tsx` 생성:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, adminLogin } from "@/lib/api";
import { setAdminToken } from "@/lib/adminAuth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { admin_token } = await adminLogin(username, password);
      setAdminToken(admin_token);
      router.replace("/admin");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "로그인에 실패했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">관리자 로그인</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <Input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={loading || !username || !password}>
          {loading ? "로그인 중…" : "로그인"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 빌드·린트 검증**

Run: `cd frontend && npm run lint && npm run build`
Expected: 성공.

- [ ] **Step 4: 수동 확인**

`npm run dev` 후 `/admin` 접속 → `/admin/login`으로 리다이렉트되는지, 잘못된 자격으로 에러 메시지가 뜨는지(백엔드 기동 시) 확인.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/layout.tsx frontend/app/admin/login/page.tsx
git commit -m "feat(admin-web): admin login page and route guard"
```

---

## Task 6: 회원 목록 화면 (테이블 + 검색/필터 + 상세 모달)

**Files:**
- Add shadcn: `table`, `dialog`
- Create: `frontend/components/admin/StudentDetailDialog.tsx`
- Create: `frontend/app/admin/page.tsx`

**Interfaces:**
- Consumes: `fetchAdminStudents`, `AdminStudentItem`, `AdminStudentList`, `ApiError` (`@/lib/api`); `getAdminToken`/`clearAdminToken` (`@/lib/adminAuth`)
- Produces: `/admin` 화면, `StudentDetailDialog` 컴포넌트

작성 전 `node_modules/next/dist/docs/`에서 `next/image` 관련 가이드를 확인할 것(외부 도메인 이미지 → `<img>` 사용으로 단순화 권장).

- [ ] **Step 1: shadcn 컴포넌트 추가**

Run: `cd frontend && npx shadcn@latest add table dialog`
Expected: `components/ui/table.tsx`, `components/ui/dialog.tsx` 생성.

- [ ] **Step 2: 상세 모달 컴포넌트 생성**

`frontend/components/admin/StudentDetailDialog.tsx` 생성:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminStudentItem } from "@/lib/api";

export function StudentDetailDialog({
  student,
  onClose,
}: {
  student: AdminStudentItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {student && (
          <>
            <DialogHeader>
              <DialogTitle>{student.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {student.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.photo_url}
                  alt={`${student.name} 사진`}
                  className="mx-auto h-48 w-48 rounded-lg object-cover"
                />
              ) : (
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  사진 없음
                </div>
              )}
              <dl className="grid grid-cols-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">학교</dt>
                <dd className="col-span-2">{student.school}</dd>
                <dt className="text-muted-foreground">학년/반/번호</dt>
                <dd className="col-span-2">
                  {student.grade}학년 {student.class_no}반 {student.student_no}번
                </dd>
                <dt className="text-muted-foreground">비밀번호</dt>
                <dd className="col-span-2 font-mono">{student.password}</dd>
                <dt className="text-muted-foreground">개인정보 동의</dt>
                <dd className="col-span-2">
                  {student.consent_privacy ? "동의" : "미동의"}
                </dd>
                <dt className="text-muted-foreground">가입일</dt>
                <dd className="col-span-2">
                  {new Date(student.created_at).toLocaleString("ko-KR")}
                </dd>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 목록 페이지 생성**

`frontend/app/admin/page.tsx` 생성:

```tsx
"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StudentDetailDialog } from "@/components/admin/StudentDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, fetchAdminStudents, type AdminStudentItem } from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";

export default function AdminStudentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminStudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      try {
        const res = await fetchAdminStudents(token, { q: q || undefined, limit: 200 });
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
      }
    },
    [router]
  );

  useEffect(() => {
    load("");
  }, [load]);

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">회원 관리</h1>
        <span className="text-sm text-muted-foreground">총 {total}명</span>
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(query);
        }}
      >
        <Input
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit">검색</Button>
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사진</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>학교</TableHead>
            <TableHead>학년/반/번호</TableHead>
            <TableHead>가입일</TableHead>
            <TableHead>비밀번호</TableHead>
            <TableHead>동의</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                회원이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            items.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => setSelected(s)}
              >
                <TableCell>
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.photo_url}
                      alt={s.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      無
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.school}</TableCell>
                <TableCell>
                  {s.grade}/{s.class_no}/{s.student_no}
                </TableCell>
                <TableCell>
                  {new Date(s.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="flex items-center gap-1 font-mono"
                    onClick={() => toggleReveal(s.id)}
                  >
                    {revealed.has(s.id) ? (
                      <>
                        {s.password} <EyeOff className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        •••••• <Eye className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </TableCell>
                <TableCell>{s.consent_privacy ? "O" : "X"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <StudentDetailDialog student={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 4: 빌드·린트 검증**

Run: `cd frontend && npm run lint && npm run build`
Expected: 성공.

- [ ] **Step 5: 수동 통합 확인**

백엔드(`cd backend && uv run uvicorn app.main:app --reload`)와 프론트(`npm run dev`)를 띄우고:
1. `/admin/login`에서 `.env`의 관리자 계정으로 로그인 → `/admin` 이동.
2. 가입된 학생이 테이블에 보이고 사진 썸네일/플레이스홀더 표시.
3. 비밀번호 눈 아이콘 토글, 행 클릭 시 상세 모달에 큰 사진·전체 정보.
4. 이름 검색 동작.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/table.tsx frontend/components/ui/dialog.tsx \
  frontend/components/admin/StudentDetailDialog.tsx frontend/app/admin/page.tsx
git commit -m "feat(admin-web): members table with photos, password toggle, detail dialog"
```

---

## Self-Review 결과

- **Spec coverage:** 관리자 인증(Task 1) · 회원 목록 API/검색·필터/presigned URL(Task 2~3) · 로그인 화면·가드(Task 5) · 테이블+썸네일+비번 토글+상세(Task 6) · 에러처리(401 리다이렉트, 사진 graceful, 빈 상태) 모두 매핑됨. 필터 UI는 spec의 "학교/학년/반 셀렉트"를 이번 구현에서 이름 검색 우선으로 단순화(`fetchAdminStudents`는 school/grade/class_no 파라미터를 이미 지원하므로 셀렉트 추가는 후속 확장 가능) — 핵심 검색 기능은 충족.
- **Placeholder scan:** 모든 코드 단계에 실제 코드 포함. TODO/TBD 없음.
- **Type consistency:** `list_students` 시그니처, `AdminStudentItem`/`AdminStudentList` 필드, `adminLogin`/`fetchAdminStudents` 반환 타입이 백엔드 스키마와 프론트 인터페이스에서 일치.

## 범위 밖 (YAGNI)

- 다중 관리자·권한(role), DB 관리자 테이블.
- 학생 수정·삭제 동작.
- 학교/학년/반 드롭다운 필터 UI(백엔드 파라미터는 준비됨, 후속 확장).
- `admin/content`, `admin/stats`, 대시보드·통계.
