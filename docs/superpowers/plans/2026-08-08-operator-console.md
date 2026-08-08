# 운영진 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 행사 현장 운영진에게 관리자 콘솔의 조회 기능만 열어주는 `/operator/*` 화면과, 그것을 서버에서 강제하는 권한 가드를 만든다.

**Architecture:** 백엔드는 `/api/admin/*` 조회 엔드포인트의 가드를 `CurrentAdminDep` → `CurrentStaffDep`(admin 또는 operator 허용)으로 바꾸고, 쓰기 엔드포인트는 `CurrentAdminDep`을 그대로 둬 운영진 토큰으로는 삭제가 401이 되게 한다. 프론트는 admin 페이지 본문을 `components/console/` 공유 뷰로 끌어올리고, React 컨텍스트가 역할·토큰·경로를 주입해 `/admin`과 `/operator`가 같은 코드를 쓰게 한다.

**Tech Stack:** FastAPI · pytest(asyncio_mode=auto) · httpx.ASGITransport · Next.js 16 App Router · TypeScript · Tailwind 4 · shadcn/ui

**Spec:** `docs/superpowers/specs/2026-08-08-operator-console-design.md`

## Global Constraints

- 브랜치는 `feat/operator-console` (base `develop`). 작업 위치는 워크트리 `/Users/imincheol/Develop/i-be/.claude/worktrees/operator-console`
- 커밋 메시지는 Conventional Commits 접두사 + 한국어 한 줄. `🤖 Generated with Claude Code` 등 자동 생성 푸터·서명을 넣지 않는다
- UI 텍스트·주석·문서는 한국어
- 백엔드 게이트: `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app` · `uv run pytest`. mypy는 strict 기준이며 `# type: ignore`에는 사유 주석을 남긴다
- 프론트 게이트: `npm run lint` · `npm run build`. lint 경고 4건(`app/explore/evening/page.tsx`의 `Moon`, `app/explore/page.tsx`의 `Compass`·`ScrollText`·`Sparkles` 미사용)은 **기존 코드의 것으로 이번 작업과 무관**하다. 에러 0을 유지하고 경고가 4건을 넘지 않게 한다
- ruff line-length = 100, target py312
- 백엔드 테스트는 실 DB·S3 없이 fake 리포지토리를 `app.dependency_overrides`로 주입하는 기존 방식을 따른다 (`backend/tests/test_admin_router.py` 참고). `conftest.py`는 없다
- 프론트에는 테스트 러너가 없다. 각 프론트 태스크의 검증은 `npm run lint && npm run build` + 브라우저 수동 확인이다
- 백엔드 조회 응답 스키마(`AdminStudentList` 등)는 외부 공개 계약이므로 필드를 제거하지 않는다

---

## File Structure

**백엔드 — 생성**

| 파일 | 책임 |
|---|---|
| `backend/app/services/operator_service.py` | 운영진 공유 비밀번호 검증 + operator 토큰 발급 |
| `backend/app/schemas/operator.py` | 운영진 로그인 요청/응답 모델 |
| `backend/tests/test_operator_router.py` | 로그인 라우터 통합 테스트 |
| `backend/tests/test_staff_guard.py` | `current_staff` 가드 + 엔드포인트 권한 경계 테스트 |
| `backend/tests/test_booth_stats.py` | 부스별 참여인원 집계 테스트 |

**백엔드 — 수정**

| 파일 | 변경 |
|---|---|
| `backend/app/config.py` | `operator_password` 필드 + 프로덕션 필수 설정 등록 |
| `backend/app/deps.py` | `OperatorServiceDep`, `current_staff`, `CurrentStaffDep` |
| `backend/app/routers/operator.py` | `/login` stub → 구현 |
| `backend/app/routers/admin.py` | 조회 5개 가드 교체 + 상세의 `include_answers` |
| `backend/app/routers/booths.py` | `GET ""` 가드 교체 + `GET /stats` 신설 |
| `backend/app/services/admin_service.py` | `get_student_detail(..., include_answers=)` |
| `backend/app/services/booth_visit_service.py` | `stats()` |
| `backend/app/repositories/booth_visit_repo.py` | `BoothVisitCountRow`, `count_by_booth`, `count_unique_students` |
| `backend/app/schemas/booths.py` | `BoothVisitStat`, `BoothStatsResponse` |
| `backend/tests/test_admin_service.py` | `include_answers=False` 케이스 |

**프론트 — 생성**

| 파일 | 책임 |
|---|---|
| `frontend/lib/operatorAuth.ts` | `operator_token` localStorage 헬퍼 |
| `frontend/components/console/ConsoleProvider.tsx` | 역할·토큰·경로 컨텍스트 |
| `frontend/components/console/StudentListView.tsx` | 회원 목록 화면 본문 (양쪽 공유) |
| `frontend/components/console/SeatingView.tsx` | 진행 현황 화면 본문 (양쪽 공유) |
| `frontend/components/console/BoothListView.tsx` | 부스 목록 화면 본문 (양쪽 공유) |
| `frontend/components/console/BoothStatsView.tsx` | 부스별 참여인원 화면 본문 (신규) |
| `frontend/app/operator/layout.tsx` · `login/page.tsx` · `page.tsx` · `seating/page.tsx` · `booths/page.tsx` · `visits/page.tsx` | 운영진 라우트 |
| `frontend/app/admin/visits/page.tsx` | 관리자 부스별 참여인원 |

**프론트 — 이동 (`git mv`)**

| 이동 |
|---|
| `components/admin/StudentDetailSidebar.tsx` → `components/console/StudentDetailSidebar.tsx` |
| `components/admin/ProgressBadge.tsx` → `components/console/ProgressBadge.tsx` |
| `components/admin/BoothQrDialog.tsx` → `components/console/BoothQrDialog.tsx` |
| `components/admin/AdminHeader.tsx` → `components/console/ConsoleHeader.tsx` |

`components/admin/BoothFormDialog.tsx`는 부스 추가·수정 전용이라 **이동하지 않는다.**

---

## Task 1: 운영진 로그인

**Files:**
- Create: `backend/app/services/operator_service.py`
- Create: `backend/app/schemas/operator.py`
- Create: `backend/tests/test_operator_router.py`
- Modify: `backend/app/config.py:18-23` (프로덕션 필수 설정), `backend/app/config.py:75-78` (운영진 설정 추가)
- Modify: `backend/app/deps.py` (`OperatorServiceDep`)
- Modify: `backend/app/routers/operator.py:10-13`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `OperatorService.authenticate(password: str) -> str`
  - `app.deps.OperatorServiceDep`
  - `POST /api/operator/login` — 요청 `{"password": str}`, 응답 `{"operator_token": str}`
  - `Settings.operator_password: str`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_operator_router.py` 생성:

```python
"""/api/operator 통합 테스트 — 실 DB 없이 설정만으로 검증."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import jwt

from app.config import get_settings
from app.core.security import TokenKind
from app.main import create_app


async def _client() -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_login_success_returns_operator_token() -> None:
    settings = get_settings()
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/operator/login", json={"password": settings.operator_password}
        )
        assert res.status_code == 200
        token = res.json()["operator_token"]
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
        )
        assert payload["kind"] == TokenKind.OPERATOR.value
        assert payload["sub"] == "operator"
    finally:
        await gen.aclose()


async def test_login_wrong_password_returns_401() -> None:
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post("/api/operator/login", json={"password": "틀린비밀번호"})
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_login_empty_password_returns_422() -> None:
    """빈 비밀번호는 서비스에 닿기 전에 스키마가 거른다."""
    gen = _client()
    client = await anext(gen)
    try:
        res = await client.post("/api/operator/login", json={"password": ""})
        assert res.status_code == 422
    finally:
        await gen.aclose()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && uv run pytest tests/test_operator_router.py -v
```

기대: 3개 모두 FAIL. 로그인 라우터가 `raise NotImplementedError`이므로 500 또는 예외.

- [ ] **Step 3: 설정 추가**

`backend/app/config.py` — `_PRODUCTION_REQUIRED_SETTINGS`에 한 줄 추가:

```python
_PRODUCTION_REQUIRED_SETTINGS = {
    "jwt_secret": "JWT_SECRET",
    "jwt_card_share_secret": "JWT_CARD_SHARE_SECRET",
    "admin_password": "ADMIN_PASSWORD",
    "operator_password": "OPERATOR_PASSWORD",
    "frontend_origin": "FRONTEND_ORIGIN",
}
```

그리고 `admin_token_ttl_hours` 아래(현재 78번째 줄 뒤)에:

```python
    # 운영진(단일 공유 비밀번호) — 아이디 없이 비밀번호만 받는다. 운영 배포 시 .env로 주입.
    # TTL은 위쪽 Auth 블록의 operator_token_ttl_hours를 쓴다.
    operator_password: str = "change-me-operator"
```

- [ ] **Step 4: 스키마 작성**

`backend/app/schemas/operator.py` 생성:

```python
"""operator 라우터용 Request/Response 모델."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OperatorLoginRequest(BaseModel):
    """운영진 로그인 — 아이디 없이 공유 비밀번호 하나만 받는다."""

    password: str = Field(..., min_length=1, max_length=128)


class OperatorLoginResponse(BaseModel):
    operator_token: str = Field(..., description="운영진 세션 JWT (Bearer)")
```

- [ ] **Step 5: 서비스 작성**

`backend/app/services/operator_service.py` 생성:

```python
"""운영진 인증 — 아이디 없이 공유 비밀번호 하나로 로그인한다.

계정 테이블을 두지 않으므로 누가 로그인했는지는 구분하지 않는다. 운영진에게는
조회 권한만 주고 쓰기는 관리자 토큰에만 열어 두는 것으로 위험을 제한한다.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from app.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import TokenKind, create_token


class OperatorService:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings

    def authenticate(self, password: str) -> str:
        """공유 비밀번호 검증 후 operator 토큰 발급. 실패 시 UnauthorizedError."""
        # 타이밍 공격 완화 — AdminService.authenticate와 같은 방식.
        if not secrets.compare_digest(password, self._settings.operator_password):
            raise UnauthorizedError("비밀번호가 올바르지 않습니다.")
        return create_token(
            kind=TokenKind.OPERATOR,
            subject="operator",
            ttl=timedelta(hours=self._settings.operator_token_ttl_hours),
            settings=self._settings,
        )
```

- [ ] **Step 6: 의존성 등록**

`backend/app/deps.py` — import에 `from app.services.operator_service import OperatorService`를 추가하고, `AdminServiceDep` 정의 뒤에:

```python
def get_operator_service(settings: SettingsDep) -> OperatorService:
    return OperatorService(settings=settings)


OperatorServiceDep = Annotated[OperatorService, Depends(get_operator_service)]
```

- [ ] **Step 7: 라우터 구현**

`backend/app/routers/operator.py`의 `login`만 교체한다. `/scan`·`/rewards` stub은 리워드 기능용이므로 **그대로 둔다.**

```python
"""/api/operator — 운영자 로그인·QR 스캔·리워드 적립."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import OperatorServiceDep
from app.schemas.operator import OperatorLoginRequest, OperatorLoginResponse

router = APIRouter(prefix="/api/operator", tags=["operator"])


@router.post("/login", response_model=OperatorLoginResponse)
async def login(
    req: OperatorLoginRequest, operators: OperatorServiceDep
) -> OperatorLoginResponse:
    """운영진 공유 비밀번호 로그인 → 운영자 세션 토큰 발급."""
    return OperatorLoginResponse(operator_token=operators.authenticate(req.password))
```

기존 `/scan`·`/rewards` 함수 정의는 파일 아래쪽에 그대로 유지한다.

- [ ] **Step 8: 테스트 통과 확인**

```bash
cd backend && uv run pytest tests/test_operator_router.py -v
```

기대: 3 passed.

- [ ] **Step 9: 전체 게이트 통과 확인**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
```

기대: 232 passed (기존 229 + 신규 3).

- [ ] **Step 10: 커밋**

```bash
git add backend/app/config.py backend/app/deps.py backend/app/routers/operator.py \
        backend/app/schemas/operator.py backend/app/services/operator_service.py \
        backend/tests/test_operator_router.py
git commit -m "feat: 운영진 공유 비밀번호 로그인 API 추가"
```

---

## Task 2: staff 권한 가드

**Files:**
- Create: `backend/tests/test_staff_guard.py`
- Modify: `backend/app/deps.py` (`current_staff`, `CurrentStaffDep`)
- Modify: `backend/app/routers/admin.py:32-44`, `:64-70`, `:83-93`, `:96-103`, `:106-113`
- Modify: `backend/app/routers/booths.py:33-40`

**Interfaces:**
- Consumes: Task 1의 `POST /api/operator/login`, `TokenKind.OPERATOR` 토큰
- Produces:
  - `app.deps.current_staff(credentials, settings) -> str` — `"admin"` 또는 `"operator"` 반환
  - `app.deps.CurrentStaffDep = Annotated[str, Depends(current_staff)]`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_staff_guard.py` 생성:

```python
"""staff 가드 권한 경계 테스트 — 운영진 토큰은 조회만 되고 쓰기는 막혀야 한다."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_admin_service, get_booth_service
from app.main import create_app
from app.services.admin_service import AdminService
from app.services.booth_service import BoothService
from tests.test_admin_service import FakeSessionRepo
from tests.test_auth_service import FakeStorage, FakeStudentRepo
from tests.test_booth_service import FakeBoothRepo


def _build() -> object:
    # Fake들은 실제 리포지토리의 구조적 대역이다(DB 없이 같은 메서드만 제공).
    admin_service = AdminService(
        students=FakeStudentRepo(),
        sessions=FakeSessionRepo(),
        storage=FakeStorage(),
        settings=get_settings(),
    )
    booth_service = BoothService(booths=FakeBoothRepo(), settings=get_settings())  # type: ignore[arg-type]
    app = create_app()
    app.dependency_overrides[get_admin_service] = lambda: admin_service
    app.dependency_overrides[get_booth_service] = lambda: booth_service
    return app


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _token(kind: TokenKind, subject: str) -> dict[str, str]:
    token = create_token(
        kind=kind, subject=subject, ttl=timedelta(hours=1), settings=get_settings()
    )
    return {"Authorization": f"Bearer {token}"}


def _operator() -> dict[str, str]:
    return _token(TokenKind.OPERATOR, "operator")


def _admin() -> dict[str, str]:
    return _token(TokenKind.ADMIN, "admin")


def _student() -> dict[str, str]:
    return _token(TokenKind.STUDENT, str(uuid4()))


# 운영진에게 열어야 하는 조회 엔드포인트.
_READ_PATHS = [
    "/api/admin/students",
    "/api/admin/students/schools",
    "/api/admin/progress/classes?school=한마당고",
    "/api/admin/booths",
]


async def test_operator_token_can_read() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_operator())
            assert res.status_code == 200, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_admin_token_still_can_read() -> None:
    """가드 교체가 관리자 경로를 깨뜨리지 않았는지 확인한다."""
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_admin())
            assert res.status_code == 200, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_operator_token_cannot_delete_student() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.delete(f"/api/admin/students/{uuid4()}", headers=_operator())
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_operator_token_cannot_bulk_delete_students() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/students/bulk-delete",
            json={"ids": [str(uuid4())]},
            headers=_operator(),
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_operator_token_cannot_write_booths() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        created = await client.post(
            "/api/admin/booths", json={"name": "AI 체험"}, headers=_operator()
        )
        assert created.status_code == 401

        updated = await client.patch(
            f"/api/admin/booths/{uuid4()}", json={"name": "수정"}, headers=_operator()
        )
        assert updated.status_code == 401

        deleted = await client.delete(f"/api/admin/booths/{uuid4()}", headers=_operator())
        assert deleted.status_code == 401
    finally:
        await gen.aclose()


async def test_student_token_rejected_everywhere() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path, headers=_student())
            assert res.status_code == 401, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()


async def test_missing_token_rejected() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for path in _READ_PATHS:
            res = await client.get(path)
            assert res.status_code == 401, f"{path} → {res.status_code}"
    finally:
        await gen.aclose()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && uv run pytest tests/test_staff_guard.py -v
```

기대: `test_operator_token_can_read`가 FAIL(운영진 토큰이 401). 나머지는 이미 통과할 수 있다 — 실패하는 것이 하나라도 있으면 정상이다.

- [ ] **Step 3: 가드 구현**

`backend/app/deps.py` — `CurrentAdminDep` 정의 뒤에 추가:

```python
def current_staff(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> str:
    """admin 또는 operator 토큰을 허용하고 역할("admin"|"operator")을 반환.

    조회 전용 엔드포인트에만 쓴다. 삭제·생성·수정은 CurrentAdminDep을 그대로 둬야
    운영진이 API를 직접 호출해도 서버가 막는다.

    decode_token은 종류를 하나만 받으므로 두 종류를 차례로 시도한다. admin·operator는
    같은 jwt_secret을 쓰기 때문에 서명 검증은 한 번으로 끝나고, 차이는 kind 클레임뿐이다.
    """
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    for kind in (TokenKind.ADMIN, TokenKind.OPERATOR):
        try:
            decode_token(credentials.credentials, expected_kind=kind, settings=settings)
        except jwt.PyJWTError:
            continue
        return kind.value
    raise UnauthorizedError("유효하지 않은 토큰입니다.")


CurrentStaffDep = Annotated[str, Depends(current_staff)]
```

- [ ] **Step 4: admin 라우터 가드 교체**

`backend/app/routers/admin.py` — import를 `from app.deps import AdminServiceDep, CurrentAdminDep, CurrentStaffDep`로 바꾼 뒤, 아래 **5개 함수**의 `_admin: CurrentAdminDep`를 `_staff: CurrentStaffDep`로 교체한다:

- `list_students`
- `list_schools`
- `class_progress`
- `student_detail`
- `student_photo_url`

`delete_student`·`bulk_delete_students`의 `_admin: CurrentAdminDep`는 **건드리지 않는다.** `login`은 가드가 없다.

- [ ] **Step 5: booths 라우터 가드 교체**

`backend/app/routers/booths.py` — import를 `from app.deps import BoothServiceDep, CurrentAdminDep, CurrentStaffDep`로 바꾸고, `list_booths`의 `_admin: CurrentAdminDep`만 `_staff: CurrentStaffDep`로 교체한다. `create_booth`·`update_booth`·`delete_booth`는 그대로 둔다.

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && uv run pytest tests/test_staff_guard.py -v
```

기대: 7 passed.

- [ ] **Step 7: 회귀 확인**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
```

기대: 239 passed. `test_admin_router.py`·`test_booths_router.py`의 관리자 경로 테스트가 그대로 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add backend/app/deps.py backend/app/routers/admin.py backend/app/routers/booths.py \
        backend/tests/test_staff_guard.py
git commit -m "feat: 조회 엔드포인트에 운영진 토큰 허용하는 staff 가드 추가"
```

---

## Task 3: 운영진 응답에서 설문 답변 제외

**Files:**
- Modify: `backend/app/services/admin_service.py:163-206`
- Modify: `backend/app/routers/admin.py:96-103`
- Modify: `backend/tests/test_admin_service.py`

**Interfaces:**
- Consumes: Task 2의 `CurrentStaffDep`
- Produces: `AdminService.get_student_detail(student_id: UUID, *, include_answers: bool = True) -> AdminStudentDetail`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_admin_service.py` 맨 아래에 추가한다. 필요한 이름(`UTC`, `datetime`, `uuid4`, `AnswerRecord`, `SessionContent`, `AdminService`, `FakeStorage`, `FakeStudentRepo`, `get_settings`)은 **이미 이 파일 상단에 import돼 있다** — 추가 import가 필요 없다.

`AnswerRecord`는 `id`·`session_id`·`stage`·`payload`·`created_at`을 모두 요구하는 frozen dataclass다. 앞의 둘을 빼면 `TypeError`가 난다.

```python
async def test_get_student_detail_omits_answers_for_operator() -> None:
    """운영진 조회에서는 설문 답변 원문이 응답에 담기지 않는다."""
    repo = FakeStudentRepo()
    sessions = FakeSessionRepo()
    student = await repo.create(
        school="한마당고",
        grade=2,
        class_no=3,
        student_no=11,
        name="홍길동",
        password="20100101",
        gender="male",
        consent_privacy=True,
    )

    session_id = uuid4()
    now = datetime.now(UTC)
    sessions.contents[student.id] = [
        SessionContent(
            id=session_id,
            status="completed",
            created_at=now,
            completed_at=now,
            answers=[
                AnswerRecord(
                    id=uuid4(),
                    session_id=session_id,
                    stage="q1to6",
                    payload={"q1": "친구들과 같이 하는 일"},
                    created_at=now,
                )
            ],
            persona=None,
            card_image_key=None,
        )
    ]
    service = AdminService(
        students=repo, sessions=sessions, storage=FakeStorage(), settings=get_settings()
    )

    for_admin = await service.get_student_detail(student.id)
    assert len(for_admin.sessions[0].answers) == 1

    for_operator = await service.get_student_detail(student.id, include_answers=False)
    assert for_operator.sessions[0].answers == []
    # 답변만 빠지고 나머지 필드는 그대로여야 한다.
    assert for_operator.sessions[0].id == session_id
    assert for_operator.name == for_admin.name
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && uv run pytest tests/test_admin_service.py::test_get_student_detail_omits_answers_for_operator -v
```

기대: FAIL — `TypeError: get_student_detail() got an unexpected keyword argument 'include_answers'`.

- [ ] **Step 3: 서비스 시그니처 확장**

`backend/app/services/admin_service.py`의 `get_student_detail`:

```python
    async def get_student_detail(
        self, student_id: UUID, *, include_answers: bool = True
    ) -> AdminStudentDetail:
        """학생 상세 — 기본 정보 + 모든 세션(최신순) 답변·페르소나·카드.

        include_answers=False면 설문 답변 원문을 비운다(운영진 조회용). 스키마는 그대로
        두어 역할에 따라 응답 형태가 달라지지 않게 한다 — 빠지는 것은 값뿐이다.
        """
```

그리고 세션 조립 루프의 `answers=` 인자를 교체한다:

```python
                    answers=[
                        AdminAnswer(stage=a.stage, payload=a.payload, created_at=a.created_at)
                        for a in c.answers
                    ]
                    if include_answers
                    else [],
```

- [ ] **Step 4: 라우터 연결**

`backend/app/routers/admin.py`의 `student_detail` — Task 2에서 이미 `_staff: CurrentStaffDep`로 바뀌었다. 역할 값을 쓰므로 이름을 `role`로 바꾸고 본문을 교체한다:

```python
@router.get("/students/{student_id}", response_model=AdminStudentDetail)
async def student_detail(
    student_id: UUID,
    role: CurrentStaffDep,
    admin: AdminServiceDep,
) -> AdminStudentDetail:
    """학생 1명 상세 — 설문 진행 단계별 답변·페르소나·카드 결과.

    운영진에게는 설문 답변 원문을 내려보내지 않는다(UI 숨김이 아니라 응답에서 제외).
    """
    return await admin.get_student_detail(student_id, include_answers=(role == "admin"))
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && uv run pytest tests/test_admin_service.py -v
```

기대: 신규 테스트 포함 전부 PASS.

- [ ] **Step 6: 전체 게이트 통과 확인**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
```

기대: 240 passed.

- [ ] **Step 7: 커밋**

```bash
git add backend/app/services/admin_service.py backend/app/routers/admin.py \
        backend/tests/test_admin_service.py
git commit -m "feat: 운영진 상세 조회에서 설문 답변 원문 제외"
```

---

## Task 4: 부스별 참여인원 API

**Files:**
- Create: `backend/tests/test_booth_stats.py`
- Modify: `backend/app/repositories/booth_visit_repo.py`
- Modify: `backend/app/schemas/booths.py`
- Modify: `backend/app/services/booth_visit_service.py`
- Modify: `backend/app/routers/booths.py`

**Interfaces:**
- Consumes: Task 2의 `CurrentStaffDep`
- Produces:
  - `BoothVisitCountRow(booth_id: UUID, code: str, name: str, visit_count: int)` — `app.repositories.booth_visit_repo`
  - `BoothVisitRepository.count_by_booth() -> list[BoothVisitCountRow]`
  - `BoothVisitRepository.count_unique_students() -> int`
  - `BoothVisitService.stats() -> BoothStatsResponse`
  - `BoothVisitStat`, `BoothStatsResponse` — `app.schemas.booths`
  - `GET /api/admin/booths/stats`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_booth_stats.py` 생성:

```python
"""부스별 참여인원 집계 — fake 방문 리포지토리로 서비스·라우터를 검증한다."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import UUID, uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_booth_visit_service
from app.main import create_app
from app.repositories.booth_visit_repo import BoothVisitCountRow
from app.services.booth_visit_service import BoothVisitService

_BOOTH_A = uuid4()
_BOOTH_B = uuid4()
_BOOTH_EMPTY = uuid4()


class FakeVisitStatsRepo:
    """BoothVisitRepository 중 집계 메서드만 흉내내는 대역."""

    def __init__(self, rows: list[BoothVisitCountRow], unique: int) -> None:
        self.rows = rows
        self.unique = unique

    async def count_by_booth(self) -> list[BoothVisitCountRow]:
        return self.rows

    async def count_unique_students(self) -> int:
        return self.unique


def _rows() -> list[BoothVisitCountRow]:
    return [
        BoothVisitCountRow(booth_id=_BOOTH_A, code="A3K9QZ", name="AI 체험", visit_count=87),
        BoothVisitCountRow(booth_id=_BOOTH_B, code="M2P4XW", name="로봇 부스", visit_count=61),
        # 아무도 찍지 않은 부스도 0으로 나와야 한다(left join).
        BoothVisitCountRow(booth_id=_BOOTH_EMPTY, code="Z9Q1RT", name="빈 부스", visit_count=0),
    ]


def _service(unique: int = 100) -> BoothVisitService:
    repo = FakeVisitStatsRepo(_rows(), unique)
    # 집계는 visits 리포지토리만 쓰므로 booths·sessions는 필요 없다.
    return BoothVisitService(booths=None, visits=repo, sessions=None)  # type: ignore[arg-type]


async def test_stats_sums_visits_and_keeps_empty_booths() -> None:
    result = await _service().stats()
    assert [b.visit_count for b in result.booths] == [87, 61, 0]
    assert result.total_visits == 148


async def test_stats_reports_unique_students_separately() -> None:
    """연인원(total_visits)과 실인원(unique_students)은 다른 값이다."""
    result = await _service(unique=100).stats()
    assert result.total_visits == 148
    assert result.unique_students == 100


async def test_stats_carries_booth_identity() -> None:
    result = await _service().stats()
    first = result.booths[0]
    assert first.booth_id == _BOOTH_A
    assert first.code == "A3K9QZ"
    assert first.name == "AI 체험"


def _build() -> object:
    app = create_app()
    app.dependency_overrides[get_booth_visit_service] = _service
    return app


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _auth(kind: TokenKind, subject: str) -> dict[str, str]:
    token = create_token(
        kind=kind, subject=subject, ttl=timedelta(hours=1), settings=get_settings()
    )
    return {"Authorization": f"Bearer {token}"}


async def test_stats_endpoint_allows_operator_and_admin() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        for headers in (
            _auth(TokenKind.OPERATOR, "operator"),
            _auth(TokenKind.ADMIN, "admin"),
        ):
            res = await client.get("/api/admin/booths/stats", headers=headers)
            assert res.status_code == 200
            body = res.json()
            assert body["total_visits"] == 148
            assert len(body["booths"]) == 3
    finally:
        await gen.aclose()


async def test_stats_endpoint_rejects_student_token() -> None:
    gen = _client(_build())
    client = await anext(gen)
    try:
        res = await client.get(
            "/api/admin/booths/stats",
            headers=_auth(TokenKind.STUDENT, str(uuid4())),
        )
        assert res.status_code == 401
    finally:
        await gen.aclose()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && uv run pytest tests/test_booth_stats.py -v
```

기대: import 단계에서 FAIL — `cannot import name 'BoothVisitCountRow'`.

- [ ] **Step 3: 리포지토리 집계 메서드 추가**

`backend/app/repositories/booth_visit_repo.py` — `BoothVisitRecord` 데이터클래스 뒤에 추가:

```python
@dataclass(frozen=True, slots=True)
class BoothVisitCountRow:
    """부스 1개의 방문 집계 — 부스별 참여인원 화면용."""

    booth_id: UUID
    code: str
    name: str
    visit_count: int
```

그리고 `BoothVisitRepository` 클래스 안에 메서드 두 개를 추가:

```python
    async def count_by_booth(self) -> list[BoothVisitCountRow]:
        """부스별 방문 학생 수(등록 순). 아무도 찍지 않은 부스도 0으로 포함한다.

        (student_id, booth_id) unique 제약 덕분에 count(*)가 곧 방문 학생 수다
        (같은 학생이 같은 부스를 여러 번 찍어도 행이 하나뿐이다).
        """
        query = """
            select b.id, b.code, b.name, count(v.id) as visit_count
              from ops.booths b
              left join ops.booth_visits v on v.booth_id = b.id
             group by b.id, b.code, b.name
             order by b.created_at
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [
            BoothVisitCountRow(
                booth_id=row["id"],
                code=row["code"],
                name=row["name"],
                visit_count=row["visit_count"],
            )
            for row in rows
        ]

    async def count_unique_students(self) -> int:
        """부스를 하나라도 찍은 학생 수(중복 제거) — 연인원이 아닌 실인원."""
        query = "select count(distinct student_id) from ops.booth_visits"
        async with self._pool.acquire() as conn:
            value = await conn.fetchval(query)
        return int(value or 0)
```

- [ ] **Step 4: 스키마 추가**

`backend/app/schemas/booths.py` 맨 아래에 추가:

```python
class BoothVisitStat(BaseModel):
    """부스 1개의 방문 집계."""

    booth_id: UUID
    code: str
    name: str
    visit_count: int = Field(..., description="이 부스를 찍은 학생 수")


class BoothStatsResponse(BaseModel):
    """부스별 참여인원 — 관리자·운영진 공통 조회."""

    booths: list[BoothVisitStat]
    total_visits: int = Field(..., description="연인원 — 부스별 방문 수의 합")
    unique_students: int = Field(..., description="실인원 — 부스를 하나라도 찍은 학생 수")
```

- [ ] **Step 5: 서비스 메서드 추가**

`backend/app/services/booth_visit_service.py`의 `BoothVisitService` 클래스에 추가한다. import에 `BoothStatsResponse`, `BoothVisitStat`를 더한다.

```python
    async def stats(self) -> BoothStatsResponse:
        """부스별 참여인원 집계 — 관리자·운영진 대시보드용.

        부스 CRUD가 아니라 '방문' 도메인이라 BoothService가 아닌 여기에 둔다.
        이 클래스가 이미 visits 리포지토리를 들고 있어 의존성도 추가되지 않는다.
        """
        rows = await self._visits.count_by_booth()
        unique = await self._visits.count_unique_students()
        return BoothStatsResponse(
            booths=[
                BoothVisitStat(
                    booth_id=r.booth_id,
                    code=r.code,
                    name=r.name,
                    visit_count=r.visit_count,
                )
                for r in rows
            ],
            total_visits=sum(r.visit_count for r in rows),
            unique_students=unique,
        )
```

- [ ] **Step 6: 라우터 추가**

`backend/app/routers/booths.py` — import에 `BoothVisitServiceDep`(from `app.deps`)와 `BoothStatsResponse`(from `app.schemas.booths`)를 더하고, `list_booths` 아래에 추가한다:

```python
@router.get("/stats", response_model=BoothStatsResponse)
async def booth_stats(
    _staff: CurrentStaffDep,
    visits: BoothVisitServiceDep,
) -> BoothStatsResponse:
    """부스별 참여인원. 이 라우터의 /{booth_id}는 PATCH·DELETE뿐이라 경로 충돌이 없다."""
    return await visits.stats()
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd backend && uv run pytest tests/test_booth_stats.py -v
```

기대: 5 passed.

- [ ] **Step 8: 전체 게이트 통과 확인**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
```

기대: 245 passed.

- [ ] **Step 9: 커밋**

```bash
git add backend/app/repositories/booth_visit_repo.py backend/app/schemas/booths.py \
        backend/app/services/booth_visit_service.py backend/app/routers/booths.py \
        backend/tests/test_booth_stats.py
git commit -m "feat: 부스별 참여인원 집계 API 추가"
```

---

## Task 5: 콘솔 컨텍스트와 공유 헤더

관리자 콘솔이 **지금과 똑같이 동작하면서** 역할·토큰·경로를 컨텍스트에서 읽도록 바꾼다. 이 태스크는 새 기능을 추가하지 않는다 — 기반 공사다.

**Files:**
- Create: `frontend/lib/operatorAuth.ts`
- Create: `frontend/components/console/ConsoleProvider.tsx`
- Move: `frontend/components/admin/AdminHeader.tsx` → `frontend/components/console/ConsoleHeader.tsx`
- Modify: `frontend/app/admin/layout.tsx`
- Modify: `frontend/app/admin/page.tsx`, `frontend/app/admin/seating/page.tsx`, `frontend/app/admin/booths/page.tsx` (import 경로 + 컴포넌트 이름)

**Interfaces:**
- Consumes: 없음 (프론트 첫 태스크)
- Produces:
  - `ConsoleRole = "admin" | "operator"`
  - `ConsoleValue { role, getToken, clearToken, loginPath, basePath }`
  - `ConsoleProvider({ value, children })`
  - `useConsole(): ConsoleValue`
  - `ADMIN_CONSOLE`, `OPERATOR_CONSOLE` — 모듈 상수 `ConsoleValue`
  - `ConsoleHeader()` — props 없음, 컨텍스트에서 읽는다
  - `getOperatorToken()`, `setOperatorToken(token)`, `clearOperatorToken()`

- [ ] **Step 1: 운영진 토큰 헬퍼 작성**

`frontend/lib/operatorAuth.ts` 생성:

```ts
// 운영진 토큰 localStorage 헬퍼. admin_token과 키를 분리해 한쪽 로그아웃이
// 다른 쪽 세션을 끊지 않게 한다.
const OPERATOR_TOKEN_KEY = "operator_token";

export function getOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(OPERATOR_TOKEN_KEY);
}

export function setOperatorToken(token: string): void {
  window.localStorage.setItem(OPERATOR_TOKEN_KEY, token);
}

export function clearOperatorToken(): void {
  window.localStorage.removeItem(OPERATOR_TOKEN_KEY);
}
```

- [ ] **Step 2: 컨텍스트 작성**

`frontend/components/console/ConsoleProvider.tsx` 생성:

```tsx
"use client";

import { createContext, useContext } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { clearOperatorToken, getOperatorToken } from "@/lib/operatorAuth";

export type ConsoleRole = "admin" | "operator";

export interface ConsoleValue {
  role: ConsoleRole;
  getToken: () => string | null;
  clearToken: () => void;
  /** 세션 만료 시 보낼 로그인 경로. */
  loginPath: string;
  /** 내비 링크를 조립할 기준 경로. */
  basePath: string;
}

// 모듈 상수로 둬야 레이아웃이 리렌더돼도 컨텍스트 값이 바뀌지 않는다
// (레이아웃 안에서 객체 리터럴을 만들면 매 렌더마다 새 값이 되어 소비자가 전부 리렌더된다).
export const ADMIN_CONSOLE: ConsoleValue = {
  role: "admin",
  getToken: getAdminToken,
  clearToken: clearAdminToken,
  loginPath: "/admin/login",
  basePath: "/admin",
};

export const OPERATOR_CONSOLE: ConsoleValue = {
  role: "operator",
  getToken: getOperatorToken,
  clearToken: clearOperatorToken,
  loginPath: "/operator/login",
  basePath: "/operator",
};

const ConsoleContext = createContext<ConsoleValue | null>(null);

export function ConsoleProvider({
  value,
  children,
}: {
  value: ConsoleValue;
  children: React.ReactNode;
}) {
  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

/** 콘솔(관리자·운영진) 공유 컴포넌트에서 역할·토큰·경로를 읽는다. */
export function useConsole(): ConsoleValue {
  const value = useContext(ConsoleContext);
  if (value === null) {
    throw new Error("useConsole은 ConsoleProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}
```

- [ ] **Step 3: 헤더 이동**

```bash
cd frontend && mkdir -p components/console
git mv components/admin/AdminHeader.tsx components/console/ConsoleHeader.tsx
```

- [ ] **Step 4: 헤더를 역할 기반으로 교체**

`frontend/components/console/ConsoleHeader.tsx` 전체를 교체:

```tsx
"use client";

import {
  BarChart3,
  LayoutGrid,
  LogOut,
  QrCode,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useConsole,
  type ConsoleRole,
} from "@/components/console/ConsoleProvider";
import { cn } from "@/lib/utils";

interface NavItem {
  /** basePath 뒤에 붙는 조각. 빈 문자열이면 basePath 자신. */
  path: string;
  label: string;
  icon: LucideIcon;
}

// 관리자와 운영진의 차이는 부스 화면 이름뿐이다 — 관리자는 편집까지, 운영진은 확인만.
const NAV: Record<ConsoleRole, NavItem[]> = {
  admin: [
    { path: "", label: "회원 목록", icon: Users },
    { path: "/seating", label: "진행 현황", icon: LayoutGrid },
    { path: "/booths", label: "부스 관리", icon: QrCode },
    { path: "/visits", label: "부스별 참여인원", icon: BarChart3 },
  ],
  operator: [
    { path: "", label: "회원 목록", icon: Users },
    { path: "/seating", label: "진행 현황", icon: LayoutGrid },
    { path: "/booths", label: "부스 확인", icon: QrCode },
    { path: "/visits", label: "부스별 참여인원", icon: BarChart3 },
  ],
};

const TITLE: Record<ConsoleRole, string> = {
  admin: "관리자 콘솔",
  operator: "운영진 콘솔",
};

/** 콘솔 공통 상단 바 — 브랜드 마크 + 역할별 내비 + 로그아웃. */
export function ConsoleHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, clearToken, loginPath, basePath } = useConsole();

  function logout() {
    clearToken();
    router.replace(loginPath);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-[var(--chart-2)] text-primary-foreground shadow-sm">
              <Users className="size-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                나Be한마당
              </p>
              <p className="text-sm font-semibold tracking-tight">
                {TITLE[role]}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV[role].map(({ path, label, icon: Icon }) => {
              const href = `${basePath}${path}`;
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
          로그아웃
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: 관리자 레이아웃에 프로바이더 연결**

`frontend/app/admin/layout.tsx` 전체를 교체. 인증 검사 로직은 지금 그대로 두고 컨텍스트만 감싼다:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ADMIN_CONSOLE,
  ConsoleProvider,
} from "@/components/console/ConsoleProvider";

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
      // 토큰은 localStorage에만 있어 마운트 후에만 인증 여부를 알 수 있다.
      // 이 effect 내 setState는 의도된 것 — 규칙을 해당 라인에서만 끈다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    if (!ADMIN_CONSOLE.getToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  if (!ready) return null;
  return <ConsoleProvider value={ADMIN_CONSOLE}>{children}</ConsoleProvider>;
}
```

- [ ] **Step 6: 관리자 페이지 3곳의 헤더 import 교체**

`frontend/app/admin/page.tsx`, `frontend/app/admin/seating/page.tsx`, `frontend/app/admin/booths/page.tsx`에서 각각:

```tsx
// 변경 전
import { AdminHeader } from "@/components/admin/AdminHeader";
// 변경 후
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
```

그리고 JSX의 `<AdminHeader />`를 `<ConsoleHeader />`로 바꾼다. 각 파일에 1곳씩이다.

- [ ] **Step 7: 게이트 통과 확인**

```bash
cd frontend && npm run lint && npm run build
```

기대: lint 에러 0 / 경고 4(기존), build 성공.

- [ ] **Step 8: 관리자 콘솔 수동 확인**

`npm run dev`로 띄우고(포트 4000) `/admin/login` → 로그인 → 회원 목록·진행 현황·부스 관리 3개 화면을 눌러본다. 내비에 "부스별 참여인원"이 보이지만 아직 404인 것이 정상이다(Task 7에서 만든다). 나머지 3개 화면과 로그아웃이 **기존과 동일하게** 동작해야 한다.

- [ ] **Step 9: 커밋**

```bash
git add frontend/lib/operatorAuth.ts frontend/components/console/ConsoleProvider.tsx \
        frontend/components/console/ConsoleHeader.tsx frontend/app/admin
git commit -m "refactor: 콘솔 역할 컨텍스트를 도입하고 관리자 헤더를 공유 헤더로 전환"
```

---

## Task 6: 공유 컴포넌트 이동과 역할 반영

**Files:**
- Move: `frontend/components/admin/ProgressBadge.tsx` → `frontend/components/console/ProgressBadge.tsx`
- Move: `frontend/components/admin/BoothQrDialog.tsx` → `frontend/components/console/BoothQrDialog.tsx`
- Move: `frontend/components/admin/StudentDetailSidebar.tsx` → `frontend/components/console/StudentDetailSidebar.tsx`
- Modify: `frontend/app/admin/page.tsx`, `frontend/app/admin/seating/page.tsx`, `frontend/app/admin/booths/page.tsx` (import 경로)

**Interfaces:**
- Consumes: Task 5의 `useConsole()`
- Produces:
  - `components/console/StudentDetailSidebar` — props는 기존과 동일 (`student`, `onClose`, `onDeleted`). 토큰·로그인 경로·삭제 노출 여부는 컨텍스트에서 읽는다
  - `components/console/ProgressBadge` — `ProgressBadge`, `SURVEY_STAGES` (기존 export 그대로)
  - `components/console/BoothQrDialog` — 기존 props 그대로

- [ ] **Step 1: 파일 이동**

```bash
cd frontend
git mv components/admin/ProgressBadge.tsx components/console/ProgressBadge.tsx
git mv components/admin/BoothQrDialog.tsx components/console/BoothQrDialog.tsx
git mv components/admin/StudentDetailSidebar.tsx components/console/StudentDetailSidebar.tsx
```

- [ ] **Step 2: 이동한 파일들의 내부 import 경로 수정**

`components/console/StudentDetailSidebar.tsx`에서:

```tsx
// 변경 전
import { SURVEY_STAGES } from "@/components/admin/ProgressBadge";
// 변경 후
import { SURVEY_STAGES } from "@/components/console/ProgressBadge";
```

`ProgressBadge.tsx`는 `lucide-react`·`@/lib/utils`·`@/lib/api`만 import하므로 고칠 것이 없다. `BoothQrDialog.tsx`도 `@/components/admin/...` 참조가 있으면 같은 방식으로 바꾼다(없으면 그대로 둔다).

- [ ] **Step 3: 사이드바를 컨텍스트 기반으로 전환**

`components/console/StudentDetailSidebar.tsx`를 다음 4곳만 고친다.

**(a) import 교체** — `getAdminToken`/`clearAdminToken` 대신 컨텍스트를 쓴다:

```tsx
// 변경 전
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
// 변경 후
import { useConsole } from "@/components/console/ConsoleProvider";
```

**(b) 컴포넌트 본문 맨 위에 훅 추가** — `const router = useRouter();` 바로 아래:

```tsx
  const { role, getToken, clearToken, loginPath } = useConsole();
```

**(c) `getAdminToken()` → `getToken()`, `clearAdminToken()` → `clearToken()`, `router.replace("/admin/login")` → `router.replace(loginPath)`** 로 일괄 교체한다. 대상은 `useEffect` 안 1곳과 `handleDelete` 안 2곳이다.

`useEffect`의 의존성 배열에 `getToken`·`loginPath`를 더한다:

```tsx
  }, [studentId, router, getToken, loginPath]);
```

(컨텍스트 값이 모듈 상수라 참조가 안정적이므로 이 의존성이 추가 렌더를 만들지 않는다.)

**(d) 관리자 전용 블록 두 개를 role로 가린다.**

설문 답변 블록 — `SessionBlock` 함수는 컴포넌트 밖에 있어 컨텍스트를 못 읽으므로 prop을 받게 바꾼다:

```tsx
function SessionBlock({
  session,
  showAnswers,
}: {
  session: AdminSessionDetail;
  showAnswers: boolean;
}) {
```

그리고 `SessionBlock` 안의 답변 렌더 블록(`{session.answers.length > 0 ? ( ... ) : ( ... )}` 전체)을 다음으로 감싼다:

```tsx
      {/* 운영진에게는 서버가 answers를 비워 보내지만, 빈 배열이면 "저장된 답변이 없습니다"로
          보여 오해를 부른다. 운영진 화면에서는 섹션 자체를 렌더하지 않는다. */}
      {showAnswers &&
        (session.answers.length > 0 ? (
          <div className="space-y-2">
            {session.answers.map((a) => (
              <div key={a.stage} className="rounded-md border p-2">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {a.stage}
                </p>
                <AnswerPayload payload={a.payload} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">저장된 답변이 없습니다.</p>
        ))}
```

호출부도 바꾼다:

```tsx
                    {detail.sessions.map((s) => (
                      <SessionBlock
                        key={s.id}
                        session={s}
                        showAnswers={role === "admin"}
                      />
                    ))}
```

삭제 영역 — `{/* 삭제 영역 */}` 주석으로 시작하는 `<section className="mt-6 border-t border-destructive/20 pt-4">` 전체를 감싼다:

```tsx
              {/* 삭제 영역 — 관리자 전용. 운영진 토큰으로는 서버도 401을 준다. */}
              {role === "admin" && (
                <section className="mt-6 border-t border-destructive/20 pt-4">
                  {/* ...기존 내용 그대로... */}
                </section>
              )}
```

- [ ] **Step 4: 관리자 페이지 3곳의 import 경로 수정**

`frontend/app/admin/page.tsx`:

```tsx
import { StudentDetailSidebar } from "@/components/console/StudentDetailSidebar";
import { ProgressBadge } from "@/components/console/ProgressBadge";
```

`frontend/app/admin/seating/page.tsx`:

```tsx
import { StudentDetailSidebar } from "@/components/console/StudentDetailSidebar";
```

`frontend/app/admin/booths/page.tsx`:

```tsx
import { BoothQrDialog } from "@/components/console/BoothQrDialog";
```

`seating/page.tsx`가 `ProgressBadge`나 `SURVEY_STAGES`를 쓰고 있으면 그것도 `@/components/console/ProgressBadge`로 바꾼다. 확인 방법:

```bash
cd frontend && grep -rn "components/admin/" app components
```

`BoothFormDialog`만 남아야 한다.

- [ ] **Step 5: 게이트 통과 확인**

```bash
cd frontend && npm run lint && npm run build
```

기대: lint 에러 0 / 경고 4, build 성공.

- [ ] **Step 6: 관리자 콘솔 수동 확인**

`/admin`에서 학생을 클릭해 사이드바를 연다. 사진·기본 정보·진행 단계·설문 답변·카드가 **모두** 보이고, 아래 "회원 삭제" 버튼도 그대로 있어야 한다(관리자 역할이므로). 부스 관리에서 QR 다이얼로그도 열어본다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/components frontend/app/admin
git commit -m "refactor: 콘솔 공유 컴포넌트를 console 폴더로 이동하고 역할별 노출 적용"
```

---

## Task 7: 부스별 참여인원 화면

**Files:**
- Create: `frontend/components/console/BoothStatsView.tsx`
- Create: `frontend/app/admin/visits/page.tsx`
- Modify: `frontend/lib/api.ts` (타입 + `fetchBoothStats`)

**Interfaces:**
- Consumes: Task 4의 `GET /api/admin/booths/stats`, Task 5의 `useConsole()`
- Produces:
  - `BoothVisitStat { booth_id: string; code: string; name: string; visit_count: number }`
  - `BoothStats { booths: BoothVisitStat[]; total_visits: number; unique_students: number }`
  - `fetchBoothStats(token: string): Promise<BoothStats>`
  - `BoothStatsView()` — props 없음

- [ ] **Step 1: API 클라이언트 추가**

`frontend/lib/api.ts`의 부스 관련 함수들(`fetchAdminBooths` 근처) 옆에 추가:

```ts
// GET /api/admin/booths/stats 응답 1행 — 부스 1개의 방문 집계.
export interface BoothVisitStat {
  booth_id: string;
  code: string;
  name: string;
  visit_count: number;
}

// total_visits는 연인원(부스별 합), unique_students는 실인원(중복 제거)이다.
export interface BoothStats {
  booths: BoothVisitStat[];
  total_visits: number;
  unique_students: number;
}

export function fetchBoothStats(token: string): Promise<BoothStats> {
  return request<BoothStats>("/api/admin/booths/stats", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

- [ ] **Step 2: 화면 작성**

`frontend/components/console/BoothStatsView.tsx` 생성:

```tsx
"use client";

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { useConsole } from "@/components/console/ConsoleProvider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, fetchBoothStats, type BoothStats } from "@/lib/api";

/** 상단 요약 숫자 1칸. */
function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** 부스별 참여인원 — 관리자·운영진 공통 화면. */
export function BoothStatsView() {
  const router = useRouter();
  const { getToken, clearToken, loginPath } = useConsole();
  const [stats, setStats] = useState<BoothStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace(loginPath);
      return;
    }
    setLoading(true);
    try {
      setStats(await fetchBoothStats(token));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace(loginPath);
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "참여인원을 불러오지 못했어요."
      );
    } finally {
      setLoading(false);
    }
  }, [router, getToken, clearToken, loginPath]);

  useEffect(() => {
    void load();
  }, [load]);

  // 가장 많이 찍힌 부스를 기준으로 막대 길이를 잡는다(0으로 나누지 않도록 최소 1).
  const max = Math.max(1, ...(stats?.booths.map((b) => b.visit_count) ?? [1]));

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight">부스별 참여인원</h1>
          <p className="text-sm text-muted-foreground">
            학생이 부스 QR을 찍은 기록을 부스별로 집계했어요.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !stats || stats.booths.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-muted-foreground">
            <Inbox className="size-8" aria-hidden />
            <p className="text-sm">아직 등록한 부스가 없어요.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
              <StatTile
                label="연인원"
                value={stats.total_visits}
                hint="부스 방문 기록 총합"
              />
              <StatTile
                label="실인원"
                value={stats.unique_students}
                hint="한 곳이라도 찍은 학생"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>부스</TableHead>
                    <TableHead>코드</TableHead>
                    <TableHead className="w-[45%]">참여</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.booths.map((b) => (
                    <TableRow key={b.booth_id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {b.code}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                            role="presentation"
                          >
                            <div
                              className="h-full rounded-full bg-[var(--chart-2)]"
                              style={{
                                width: `${(b.visit_count / max) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right tabular-nums">
                            {b.visit_count}명
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 관리자 라우트 추가**

`frontend/app/admin/visits/page.tsx` 생성:

```tsx
"use client";

import { BoothStatsView } from "@/components/console/BoothStatsView";

export default function AdminVisitsPage() {
  return <BoothStatsView />;
}
```

- [ ] **Step 4: 게이트 통과 확인**

```bash
cd frontend && npm run lint && npm run build
```

기대: lint 에러 0 / 경고 4, build 성공.

- [ ] **Step 5: 수동 확인**

백엔드를 띄운 뒤 `/admin/visits`에 접속한다. 부스가 없으면 빈 상태, 있으면 부스별 막대와 연인원·실인원 두 숫자가 보인다. Task 5에서 404였던 내비 항목이 이제 열려야 한다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/lib/api.ts frontend/components/console/BoothStatsView.tsx \
        frontend/app/admin/visits
git commit -m "feat: 부스별 참여인원 화면 추가"
```

---

## Task 8: 회원 목록·진행 현황·부스 목록 공유 뷰 추출

관리자 페이지 3개의 본문을 `components/console/`로 옮기고, 쓰기 UI를 `role === "admin"`으로 가린다. 관리자 라우트는 껍데기만 남는다.

**Files:**
- Create: `frontend/components/console/StudentListView.tsx`
- Create: `frontend/components/console/SeatingView.tsx`
- Create: `frontend/components/console/BoothListView.tsx`
- Modify: `frontend/app/admin/page.tsx`, `frontend/app/admin/seating/page.tsx`, `frontend/app/admin/booths/page.tsx` (껍데기로 축소)

**Interfaces:**
- Consumes: Task 5의 `useConsole()`, Task 6의 이동된 공유 컴포넌트
- Produces: `StudentListView()`, `SeatingView()`, `BoothListView()` — 모두 props 없음

- [ ] **Step 1: StudentListView 추출**

`frontend/app/admin/page.tsx`의 **전체 내용**을 `frontend/components/console/StudentListView.tsx`로 옮긴다. 그 다음 아래를 고친다:

1. 기본 export 함수 선언을 이름 있는 export로 바꾼다:
   ```tsx
   export function StudentListView() {
   ```
   (기존 `export default function AdminStudentsPage() {`)
2. `import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";`를 지우고 `import { useConsole } from "@/components/console/ConsoleProvider";`를 넣는다.
3. 컴포넌트 본문 맨 위 `const router = useRouter();` 아래에 추가:
   ```tsx
   const { role, getToken, clearToken, loginPath } = useConsole();
   const canDelete = role === "admin";
   ```
4. `getAdminToken()` → `getToken()`, `clearAdminToken()` → `clearToken()`, `router.replace("/admin/login")` → `router.replace(loginPath)`로 전부 교체한다 (`load`, `loadSchools`, `togglePhoto`, `handleBulkDelete`에 흩어져 있다).
5. `load`의 `useCallback` 의존성 배열 끝에 `getToken, clearToken, loginPath`를 더하고, `loadSchools`의 의존성 배열에 `getToken`을 더한다.
6. 쓰기 UI 세 곳을 `canDelete &&`로 감싼다:
   - 선택 삭제 툴바: `{checkedIds.size > 0 && (` → `{canDelete && checkedIds.size > 0 && (`
   - 확인 다이얼로그: `<Dialog open={bulkConfirming} ...>` 전체를 `{canDelete && ( ... )}`로 감싼다
   - 표의 체크박스 열: `<TableHead className="w-10 pl-5">...</TableHead>`와 각 행의 대응 `<TableCell className="pl-5" onClick={...}>...</TableCell>`, 그리고 로딩 스켈레톤 행의 첫 `<TableCell className="pl-5">` 을 각각 `{canDelete && ( ... )}`로 감싼다
7. 열 개수가 역할에 따라 달라지므로 빈 상태의 `colSpan={10}`을 다음으로 바꾼다:
   ```tsx
   <TableCell colSpan={canDelete ? 10 : 9} className="py-16">
   ```

- [ ] **Step 2: 관리자 회원 목록 라우트를 껍데기로**

`frontend/app/admin/page.tsx` 전체를 교체:

```tsx
"use client";

import { StudentListView } from "@/components/console/StudentListView";

export default function AdminStudentsPage() {
  return <StudentListView />;
}
```

- [ ] **Step 3: SeatingView 추출**

`frontend/app/admin/seating/page.tsx`의 전체 내용을 `frontend/components/console/SeatingView.tsx`로 옮기고, Step 1의 1~5번과 같은 방식으로 고친다. 함수 이름은 `export function SeatingView()`. 이 화면에는 쓰기 UI가 없으므로 `canDelete`나 role 분기는 필요 없다 — `useConsole()`에서 `getToken`·`clearToken`·`loginPath`만 꺼내 쓴다.

`frontend/app/admin/seating/page.tsx`를 교체:

```tsx
"use client";

import { SeatingView } from "@/components/console/SeatingView";

export default function AdminSeatingPage() {
  return <SeatingView />;
}
```

- [ ] **Step 4: BoothListView 추출**

`frontend/app/admin/booths/page.tsx`의 전체 내용을 `frontend/components/console/BoothListView.tsx`로 옮기고 아래를 고친다:

1. `export function BoothListView() {`
2. `adminAuth` import를 `useConsole`로 교체하고, 본문 맨 위에:
   ```tsx
   const { role, getToken, clearToken, loginPath } = useConsole();
   const canEdit = role === "admin";
   ```
3. `getAdminToken()`/`clearAdminToken()`/`router.replace("/admin/login")`을 컨텍스트 값으로 교체한다 (`load`, `handleSubmit`, `handleDelete` 3곳).
4. `load`의 의존성 배열에 `getToken, clearToken, loginPath`를 더한다.
5. 제목·설명을 역할에 맞춘다:
   ```tsx
   <h1 className="text-lg font-semibold tracking-tight">
     {canEdit ? "부스 관리" : "부스 확인"}
   </h1>
   <p className="text-sm text-muted-foreground">
     {canEdit
       ? "부스를 등록하면 QR 링크가 자동으로 발급돼요."
       : "부스 이름과 코드를 확인하고 QR을 다시 볼 수 있어요."}
   </p>
   ```
6. "부스 추가" 버튼을 감싼다: `{canEdit && (<Button onClick={openCreate} ...>...</Button>)}`
7. 표 행의 "수정"·"삭제" 버튼 두 개를 `{canEdit && (<>...</>)}`로 감싼다. **"QR" 버튼은 감싸지 않는다** — 양쪽 모두 쓴다.
8. `<BoothFormDialog ... />`를 `{canEdit && <BoothFormDialog ... />}`로 감싼다. `BoothQrDialog`는 그대로 둔다.

`frontend/app/admin/booths/page.tsx`를 교체:

```tsx
"use client";

import { BoothListView } from "@/components/console/BoothListView";

export default function AdminBoothsPage() {
  return <BoothListView />;
}
```

- [ ] **Step 5: 게이트 통과 확인**

```bash
cd frontend && npm run lint && npm run build
```

기대: lint 에러 0 / 경고 4, build 성공.

- [ ] **Step 6: 관리자 콘솔 전체 수동 확인 (회귀 검사)**

이번 작업의 최대 회귀 지점이다. `/admin`에서 다음을 모두 확인한다:

- 회원 목록: 검색, 학교 필터, 정렬, 페이지 크기 변경, 페이지 이동
- 회원 목록: 체크박스 선택 → 선택 삭제 툴바 노출 → 확인 다이얼로그 (실제 삭제는 하지 않아도 된다)
- 회원 목록: 아바타 클릭 → 사진 표시, 비밀번호 눈 아이콘 → 평문 표시
- 회원 목록: 행 클릭 → 상세 사이드바 (설문 답변·삭제 버튼 모두 보임)
- 진행 현황: 학교·학년 선택 → 좌석표 렌더, 셀 클릭 → 사이드바
- 부스 관리: 부스 추가·수정·삭제 버튼과 QR 버튼 모두 동작

- [ ] **Step 7: 커밋**

```bash
git add frontend/components/console frontend/app/admin
git commit -m "refactor: 콘솔 화면 본문을 공유 뷰로 추출하고 쓰기 UI를 역할로 분기"
```

---

## Task 9: 운영진 라우트

**Files:**
- Create: `frontend/app/operator/layout.tsx`
- Create: `frontend/app/operator/login/page.tsx`
- Create: `frontend/app/operator/page.tsx`
- Create: `frontend/app/operator/seating/page.tsx`
- Create: `frontend/app/operator/booths/page.tsx`
- Create: `frontend/app/operator/visits/page.tsx`
- Modify: `frontend/lib/api.ts` (`operatorLogin`)

**Interfaces:**
- Consumes: Task 1의 `POST /api/operator/login`, Task 5의 `OPERATOR_CONSOLE`·`setOperatorToken`, Task 7·8의 공유 뷰
- Produces: `operatorLogin(password: string): Promise<OperatorLoginResponse>`

- [ ] **Step 1: 로그인 API 클라이언트 추가**

`frontend/lib/api.ts`의 `adminLogin` 아래에 추가:

```ts
export interface OperatorLoginResponse {
  operator_token: string;
}

export function operatorLogin(
  password: string
): Promise<OperatorLoginResponse> {
  return request<OperatorLoginResponse>("/api/operator/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}
```

- [ ] **Step 2: 레이아웃 작성**

`frontend/app/operator/layout.tsx` 생성 — 관리자 레이아웃과 같은 패턴이다:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ConsoleProvider,
  OPERATOR_CONSOLE,
} from "@/components/console/ConsoleProvider";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === "/operator/login";

  useEffect(() => {
    if (isLoginPage) {
      // 토큰은 localStorage에만 있어 마운트 후에만 인증 여부를 알 수 있다.
      // 이 effect 내 setState는 의도된 것 — 규칙을 해당 라인에서만 끈다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    if (!OPERATOR_CONSOLE.getToken()) {
      router.replace("/operator/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  if (!ready) return null;
  return <ConsoleProvider value={OPERATOR_CONSOLE}>{children}</ConsoleProvider>;
}
```

- [ ] **Step 3: 로그인 화면 작성**

`frontend/app/operator/login/page.tsx` 생성:

```tsx
"use client";

import { LogIn, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, operatorLogin } from "@/lib/api";
import { setOperatorToken } from "@/lib/operatorAuth";

export default function OperatorLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { operator_token } = await operatorLogin(password);
      setOperatorToken(operator_token);
      router.replace("/operator");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "로그인에 실패했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-[var(--chart-2)] text-primary-foreground shadow-sm">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            나Be한마당
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">운영진 로그인</h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="operator-password" className="text-sm font-medium">
                비밀번호
              </label>
              <Input
                id="operator-password"
                type="password"
                placeholder="운영진 공통 비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                아이디 없이 운영진 공통 비밀번호만 입력해요.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full gap-1.5"
              disabled={loading || !password}
            >
              {loading ? (
                "로그인 중…"
              ) : (
                <>
                  <LogIn className="size-4" aria-hidden />
                  로그인
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 나머지 4개 라우트 작성**

`frontend/app/operator/page.tsx`:

```tsx
"use client";

import { StudentListView } from "@/components/console/StudentListView";

export default function OperatorStudentsPage() {
  return <StudentListView />;
}
```

`frontend/app/operator/seating/page.tsx`:

```tsx
"use client";

import { SeatingView } from "@/components/console/SeatingView";

export default function OperatorSeatingPage() {
  return <SeatingView />;
}
```

`frontend/app/operator/booths/page.tsx`:

```tsx
"use client";

import { BoothListView } from "@/components/console/BoothListView";

export default function OperatorBoothsPage() {
  return <BoothListView />;
}
```

`frontend/app/operator/visits/page.tsx`:

```tsx
"use client";

import { BoothStatsView } from "@/components/console/BoothStatsView";

export default function OperatorVisitsPage() {
  return <BoothStatsView />;
}
```

- [ ] **Step 5: 게이트 통과 확인**

```bash
cd frontend && npm run lint && npm run build
```

기대: lint 에러 0 / 경고 4, build 성공.

- [ ] **Step 6: 운영진 콘솔 수동 확인**

백엔드를 띄우고(`backend/.env`에 `OPERATOR_PASSWORD`를 설정하거나 기본값 `change-me-operator` 사용) `/operator/login`에서 로그인한 뒤 확인한다:

- 회원 목록: 검색·필터·정렬·페이지네이션 동작. **체크박스 열과 선택 삭제 툴바가 없다**
- 회원 목록: 비밀번호 눈 아이콘·아바타 사진이 보인다
- 회원 상세 사이드바: 사진·기본 정보·진행 단계·페르소나·카드가 보이고, **설문 답변 섹션과 회원 삭제 버튼이 없다**
- 진행 현황: 좌석표 정상 동작
- 부스 확인: 제목이 "부스 확인", **추가·수정·삭제 버튼이 없고** QR 버튼만 있다
- 부스별 참여인원: 연인원·실인원과 부스별 막대가 보인다
- 헤더 타이틀이 "운영진 콘솔"이고 로그아웃이 `/operator/login`으로 간다

- [ ] **Step 7: 권한 경계 수동 확인**

운영진으로 로그인한 상태에서 브라우저 콘솔에 붙여넣어 서버가 실제로 막는지 확인한다:

```js
fetch("http://localhost:8000/api/admin/students/00000000-0000-0000-0000-000000000000", {
  method: "DELETE",
  headers: { Authorization: `Bearer ${localStorage.getItem("operator_token")}` },
}).then((r) => console.log("status:", r.status));
```

기대: `status: 401`.

같은 창에서 `/admin`을 직접 입력하면 `admin_token`이 없어 `/admin/login`으로 튕겨야 한다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/lib/api.ts frontend/app/operator
git commit -m "feat: 운영진 콘솔 라우트 추가"
```

---

## Task 10: 문서 갱신

**Files:**
- Modify: `frontend/CLAUDE.md` (라우팅 표)
- Modify: `backend/README.md` (환경변수 — `OPERATOR_PASSWORD` 항목이 있는 표/목록)
- Modify: `DEPLOYMENT.md` (환경변수 + 변경 이력)

**Interfaces:**
- Consumes: Task 1~9 전부
- Produces: 없음 (문서만)

- [ ] **Step 1: 프론트 라우팅 문서 갱신**

`frontend/CLAUDE.md`의 "### 라우팅" 블록에서 `/operator/*   운영자용 (미구현)` 줄을 실제 경로로 바꾼다:

```
/operator/login             운영진 로그인 (비밀번호만)
/operator                   회원 목록 (읽기 전용)
/operator/seating           진행 현황
/operator/booths            부스 확인·QR
/operator/visits            부스별 참여인원
/admin/*                    관리자용
```

`/admin/*   관리자용 (미구현)`도 실제 상태에 맞게 "(미구현)"을 뗀다.

- [ ] **Step 2: 백엔드 환경변수 문서 갱신**

`backend/README.md`에서 `ADMIN_PASSWORD`를 설명하는 곳을 찾아 바로 아래에 추가한다:

```
| `OPERATOR_PASSWORD` | 운영진 공통 비밀번호 (아이디 없음). `APP_ENV=production`에서는 필수 |
```

문서의 기존 표 형식(열 개수·순서)에 맞춰 넣는다. 표가 아니라 목록이면 목록 형식을 따른다. **값은 절대 적지 않는다.**

- [ ] **Step 3: 배포 문서 갱신**

`DEPLOYMENT.md`의 환경변수 절에 `OPERATOR_PASSWORD`를 추가하고, 아래 경고를 눈에 띄게 넣는다:

```markdown
> `OPERATOR_PASSWORD`는 `APP_ENV=production`에서 필수다. 서버 `backend/.env`에
> 넣기 전에 `production`으로 머지하면 앱 기동이 실패한다. `backend/**` 변경은
> push 즉시 자동 재배포되므로 순서를 지킨다.
> 1. 서버 `backend/.env`에 `OPERATOR_PASSWORD=...` 추가
> 2. PR을 `production`에 머지
> 3. `https://api.cnu-likelion.kr/healthz` 확인
```

문서 하단 변경 이력에 한 줄 더한다:

```markdown
- 2026-08-08: 운영진 콘솔 추가 — `OPERATOR_PASSWORD` 환경변수 필수화
```

- [ ] **Step 4: 전체 게이트 최종 확인**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ../frontend && npm run lint && npm run build
```

기대: 백엔드 245 passed, 프론트 lint 에러 0 / 경고 4, build 성공.

- [ ] **Step 5: 커밋**

```bash
git add frontend/CLAUDE.md backend/README.md DEPLOYMENT.md
git commit -m "docs: 운영진 콘솔 라우트와 OPERATOR_PASSWORD 환경변수 반영"
```

---

## 완료 후

`superpowers:finishing-a-development-branch` 스킬로 통합 방식을 정한다. PR을 낸다면:

- base는 `production` (CLAUDE.md 규칙)
- 제목: `feat: 운영진 콘솔 추가`
- 본문은 `## 개요` + `## 변경 내용`, 백엔드/프론트로 나눠 적고 **`backend/**` 변경 → 자동 배포**임을 명시
- **머지 전에 서버 `backend/.env`에 `OPERATOR_PASSWORD`가 들어갔는지 확인한다**
