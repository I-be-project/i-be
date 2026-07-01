# 페르소나 완료 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Q10 페르소나 후보 선택 시 실제 AI 결과를 백엔드에 완료 저장하고, 결과 화면에서 mock 덮어쓰기를 제거한다.

**Architecture:** 프론트가 Q10 확정 시 인증된 `POST /api/sessions/complete`를 한 번 호출 → `SessionService.complete_survey`가 `DBPool.transaction()` 안에서 `sessions`(completed) + `personas`를 원자적으로 저장 → `get_profile_summary`로 `ProfileSummary` 반환. 중간 답변은 저장하지 않는다(최종 결과만).

**Tech Stack:** Backend = FastAPI + asyncpg + pytest(asyncio_mode=auto). Frontend = Next.js 16 App Router + TypeScript + Zustand + vitest.

## Global Constraints

- **저장 범위:** 최종 결과만 저장. `answers` 테이블/개별 답변 저장 없음. `cards`/`card_image_key`는 이번 범위 밖(그대로 둠).
- **완료 판단:** 학생의 가장 최근 `generated.sessions.status == 'completed'`. 재시도 = 새 세션 INSERT.
- **1:1 제약:** `session : persona = 1:1` (persona.session_id UNIQUE).
- **재완료:** `ops.settings.retry_enabled`(키 `"retry_enabled"`)가 true일 때만 새 완료 세션 허용, 아니면 409(`ConflictError`).
- **에러 포맷:** 도메인 에러는 `app/core/errors.py`의 `DomainError` 하위 클래스 사용 → `{error:{code,message,details}}`. 409는 기존 `ConflictError`(code `"conflict"`).
- **인증:** 완료 저장은 `CurrentStudentDep`(JWT → student_id UUID) 필요.
- **테스트 실행:** backend `cd backend && uv run pytest <경로> -v`, frontend `cd frontend && npx vitest run <경로>`.
- **Git:** 이 저장소는 git이 아님(`Is a git repository: false`). 각 태스크 끝 "Commit" 단계는 git 초기화 후 수행하거나 생략한다(코드/테스트는 그대로).

---

## File Structure

**Backend**
- Modify `app/repositories/session_repo.py` — `create()`에 `status`/`conn` 인자 추가, `completed_at` 처리.
- Modify `app/repositories/persona_repo.py` — stub `create()` 구현.
- Modify `app/services/session_service.py` — `DBPool` 주입 + `complete_survey()` 구현, repo Protocol 확장.
- Modify `app/deps.py` — `get_session_service`에 `DBPoolDep` 주입.
- Modify `app/routers/sessions.py` — `POST /api/sessions/complete` 추가.
- Modify `tests/test_session_service.py` — fake에 `create`/`FakeDBPool` 추가, 생성자 시그니처 갱신, `complete_survey` 테스트.
- Modify `tests/test_students_profile_router.py` — `_service` 생성자 갱신(db_pool).
- Create `tests/test_sessions_complete_router.py` — 엔드포인트 통합 테스트.

**Frontend**
- Modify `lib/api.ts` — `completeSurvey()` + `PersonaInput` 추가.
- Create `lib/api.test.ts` — `completeSurvey` fetch mock 테스트.
- Modify `app/explore/interpreting/page.tsx` — mock 덮어쓰기 제거.
- Modify `app/explore/path/page.tsx` — `submitQ10`에서 `completeSurvey` 호출.
- Modify `app/explore/page.tsx` — 로그인 게이트.

---

## Task 1: 백엔드 완료 저장 서비스 + 저장소 create

**Files:**
- Modify: `backend/app/repositories/session_repo.py`
- Modify: `backend/app/repositories/persona_repo.py`
- Modify: `backend/app/services/session_service.py`
- Modify: `backend/app/deps.py`
- Test: `backend/tests/test_session_service.py`

**Interfaces:**
- Consumes: `SessionRecord`, `PersonaRecord`(기존 dataclass), `Persona`(`app/schemas/persona.py`), `DBPool.transaction()`(`app/adapters/db_pool.py`), `ConflictError`(`app/core/errors.py`), `RETRY_ENABLED_KEY`(기존, `"retry_enabled"`).
- Produces:
  - `SessionRepository.create(student_id: UUID, *, status: str = "in_progress", conn: Any = None) -> SessionRecord`
  - `PersonaRepository.create(session_id: UUID, persona: Persona, *, conn: Any = None) -> PersonaRecord`
  - `SessionService.__init__(..., db_pool: TxPool)` (기존 인자 뒤에 keyword `db_pool` 추가)
  - `SessionService.complete_survey(student_id: UUID, persona: Persona) -> ProfileSummary`

- [ ] **Step 1: session_repo.create 시그니처/쿼리 수정**

`backend/app/repositories/session_repo.py`의 `create`를 아래로 교체:

```python
from typing import Any


class SessionRepository(BaseRepository):
    async def create(
        self,
        student_id: UUID,
        *,
        status: str = "in_progress",
        conn: Any = None,
    ) -> SessionRecord:
        """새 세션 행 생성. status='completed'이면 completed_at=now().

        conn이 주어지면 그 커넥션(트랜잭션)으로 실행, 없으면 자체 풀에서 acquire.
        """
        query = f"""
            insert into generated.sessions (student_id, status, completed_at)
            values ($1, $2, case when $2 = 'completed' then now() else null end)
            returning {_COLUMNS}
        """
        if conn is not None:
            row = await conn.fetchrow(query, student_id, status)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, student_id, status)
        assert row is not None  # RETURNING 이므로 항상 한 행
        return SessionRecord(
            id=row["id"],
            student_id=row["student_id"],
            status=row["status"],
            created_at=row["created_at"],
            completed_at=row["completed_at"],
        )
```

`_COLUMNS`/`get_latest_for_student`/`SessionRecord`는 그대로 둔다. `insert_answer`/`list_answers`/`update_status` 스텁도 그대로 유지.

- [ ] **Step 2: persona_repo.create 구현**

`backend/app/repositories/persona_repo.py`의 stub `create`를 아래로 교체(파일 상단에 `from typing import Any`, `from app.schemas.persona import Persona` 추가):

```python
from typing import Any

from app.schemas.persona import Persona


class PersonaRepository(BaseRepository):
    async def create(
        self,
        session_id: UUID,
        persona: Persona,
        *,
        conn: Any = None,
    ) -> PersonaRecord:
        """세션에 연결된 페르소나 행 생성. keywords/fields는 jsonb로 저장."""
        query = f"""
            insert into generated.personas (session_id, name, tagline, keywords, fields)
            values ($1, $2, $3, $4::jsonb, $5::jsonb)
            returning {_COLUMNS}
        """
        keywords = json.dumps(list(persona.keywords), ensure_ascii=False)
        fields = json.dumps(list(persona.fields), ensure_ascii=False)
        args = (session_id, persona.name, persona.tagline, keywords, fields)
        if conn is not None:
            row = await conn.fetchrow(query, *args)
        else:
            async with self._pool.acquire() as c:
                row = await c.fetchrow(query, *args)
        assert row is not None
        return PersonaRecord(
            id=row["id"],
            session_id=row["session_id"],
            name=row["name"],
            tagline=row["tagline"],
            keywords=_json_str_list(row["keywords"]),
            fields=_json_str_list(row["fields"]),
            created_at=row["created_at"],
        )
```

`json`은 이미 파일 상단에 import되어 있다. `_COLUMNS`/`_json_str_list`/`get_by_session`는 그대로 둔다.

- [ ] **Step 3: 실패하는 서비스 테스트 작성**

`backend/tests/test_session_service.py` 상단 import에 추가:

```python
from contextlib import asynccontextmanager
from typing import Any

from app.core.errors import ConflictError
from app.schemas.persona import Persona
```

`FakeSessionRepo`/`FakePersonaRepo`를 아래로 교체(기존 get 메서드 유지 + create 추가):

```python
class FakeSessionRepo:
    def __init__(self, latest: SessionRecord | None = None) -> None:
        self.latest = latest
        self.created: list[SessionRecord] = []

    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None:
        return self.latest

    async def create(
        self, student_id: UUID, *, status: str = "in_progress", conn: Any = None
    ) -> SessionRecord:
        rec = SessionRecord(
            id=uuid4(),
            student_id=student_id,
            status=status,
            created_at=datetime.now(UTC),
            completed_at=datetime.now(UTC) if status == "completed" else None,
        )
        self.created.append(rec)
        self.latest = rec  # 이후 get_profile_summary가 최신 세션으로 보게 함
        return rec


class FakePersonaRepo:
    def __init__(self, persona: PersonaRecord | None = None) -> None:
        self.persona = persona
        self.created: list[PersonaRecord] = []

    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None:
        return self.persona

    async def create(
        self, session_id: UUID, persona: Persona, *, conn: Any = None
    ) -> PersonaRecord:
        rec = PersonaRecord(
            id=uuid4(),
            session_id=session_id,
            name=persona.name,
            tagline=persona.tagline,
            keywords=list(persona.keywords),
            fields=list(persona.fields),
            created_at=datetime.now(UTC),
        )
        self.created.append(rec)
        self.persona = rec
        return rec
```

`FakeStorage` 아래에 `FakeDBPool` 추가:

```python
class FakeDBPool:
    def __init__(self) -> None:
        self.entered = False

    @asynccontextmanager
    async def transaction(self):
        self.entered = True
        yield object()  # 더미 conn (fake repo는 conn을 사용하지 않음)
```

`_build`를 db_pool 주입하도록 수정하고 db_pool도 반환:

```python
def _build(
    *,
    latest: SessionRecord | None,
    persona: PersonaRecord | None = None,
    card: CardRecord | None = None,
    retry: object = False,
    student: StudentRecord | None = None,
) -> tuple[SessionService, FakeStorage, FakeDBPool]:
    storage = FakeStorage()
    db_pool = FakeDBPool()
    service = SessionService(
        students=FakeStudentRepo(student or _student()),
        sessions=FakeSessionRepo(latest),
        personas=FakePersonaRepo(persona),
        cards=FakeCardRepo(card),
        settings_repo=FakeSettingsRepo(retry),
        storage=storage,
        settings=get_settings(),
        db_pool=db_pool,
    )
    return service, storage, db_pool
```

기존 테스트들의 `service, storage = _build(...)` / `service, _ = _build(...)` 호출을 3-튜플로 갱신한다(예: `service, _, _ = _build(...)`, `service, storage, _ = _build(...)`). `test_missing_student_returns_none_student`의 인라인 `SessionService(...)` 생성에도 `db_pool=FakeDBPool()` 인자를 추가한다.

파일 끝에 신규 테스트 추가:

```python
def _persona_input() -> Persona:
    return Persona(
        name="숲을 지키는 드론전문가",
        tagline="자연과 기술을 잇는 사람",
        keywords=["자연", "기술"],
        fields=["환경", "로보틱스"],
    )


async def test_complete_survey_creates_completed_session_and_persona() -> None:
    service, _, db_pool = _build(latest=None)
    summary = await service.complete_survey(uuid4(), _persona_input())
    assert db_pool.entered is True
    assert service._sessions.created[0].status == "completed"  # type: ignore[attr-defined]
    assert service._personas.created[0].name == "숲을 지키는 드론전문가"  # type: ignore[attr-defined]
    assert summary.has_completed is True
    assert summary.persona is not None
    assert summary.persona.name == "숲을 지키는 드론전문가"
    assert summary.persona.keywords == ["자연", "기술"]


async def test_complete_survey_conflict_when_completed_and_retry_off() -> None:
    service, _, _ = _build(latest=_session("completed"), retry=False)
    import pytest

    with pytest.raises(ConflictError):
        await service.complete_survey(uuid4(), _persona_input())


async def test_complete_survey_allows_new_session_when_retry_on() -> None:
    service, _, _ = _build(latest=_session("completed"), retry=True)
    summary = await service.complete_survey(uuid4(), _persona_input())
    assert summary.has_completed is True
    assert len(service._sessions.created) == 1  # type: ignore[attr-defined]
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `cd backend && uv run pytest tests/test_session_service.py -v`
Expected: `test_complete_survey_*` 3개 FAIL (`SessionService`에 `db_pool` 인자/`complete_survey` 없음). 기존 테스트는 `_build` 3-튜플 갱신 후 통과.

- [ ] **Step 5: SessionService에 db_pool 주입 + complete_survey 구현**

`backend/app/services/session_service.py` 수정. 상단 import 추가:

```python
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from app.core.errors import ConflictError
from app.schemas.persona import Persona
```

repo Protocol 확장 + 신규 `TxPool` Protocol 추가:

```python
class SessionRepo(Protocol):
    async def get_latest_for_student(self, student_id: UUID) -> SessionRecord | None: ...
    async def create(
        self, student_id: UUID, *, status: str = ..., conn: Any = ...
    ) -> SessionRecord: ...


class PersonaRepo(Protocol):
    async def get_by_session(self, session_id: UUID) -> PersonaRecord | None: ...
    async def create(
        self, session_id: UUID, persona: Persona, *, conn: Any = ...
    ) -> PersonaRecord: ...


class TxPool(Protocol):
    def transaction(self) -> AbstractAsyncContextManager[Any]: ...
```

`__init__`에 `db_pool` 추가:

```python
    def __init__(
        self,
        *,
        students: StudentRepo,
        sessions: SessionRepo,
        personas: PersonaRepo,
        cards: CardRepo,
        settings_repo: SettingsRepo,
        storage: CardImageStorage,
        settings: Settings,
        db_pool: TxPool,
    ) -> None:
        self._students = students
        self._sessions = sessions
        self._personas = personas
        self._cards = cards
        self._settings_repo = settings_repo
        self._storage = storage
        self._settings = settings
        self._db_pool = db_pool
```

`get_profile_summary` 아래에 신규 메서드 추가:

```python
    async def complete_survey(self, student_id: UUID, persona: Persona) -> ProfileSummary:
        """페르소나 선택 확정 → 완료 세션 + 페르소나를 원자적으로 저장.

        최근 세션이 completed이고 retry_enabled가 false면 409(ConflictError).
        session INSERT와 persona INSERT는 하나의 트랜잭션으로 묶는다.
        """
        latest = await self._sessions.get_latest_for_student(student_id)
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY))
        if latest is not None and latest.status == "completed" and not retry_enabled:
            raise ConflictError("이미 설문을 완료했습니다.")

        async with self._db_pool.transaction() as conn:
            session = await self._sessions.create(
                student_id, status="completed", conn=conn
            )
            await self._personas.create(session.id, persona, conn=conn)

        return await self.get_profile_summary(student_id)
```

- [ ] **Step 6: deps.py에 DBPool 주입**

`backend/app/deps.py`의 `get_session_service`를 수정 — `db_pool` 인자 추가:

```python
def get_session_service(
    students: StudentRepoDep,
    sessions: Annotated[SessionRepository, Depends(get_session_repo)],
    personas: Annotated[PersonaRepository, Depends(get_persona_repo)],
    cards: Annotated[CardRepository, Depends(get_card_repo)],
    settings_repo: Annotated[SettingsRepository, Depends(get_settings_repo)],
    storage: StorageClientDep,
    settings: SettingsDep,
    db_pool: DBPoolDep,
) -> SessionService:
    return SessionService(
        students=students,
        sessions=sessions,
        personas=personas,
        cards=cards,
        settings_repo=settings_repo,
        storage=storage,
        settings=settings,
        db_pool=db_pool,
    )
```

`DBPoolDep`는 이미 `deps.py`에 정의되어 있다(추가 import 불필요).

- [ ] **Step 7: 테스트 실행 → 통과 확인**

Run: `cd backend && uv run pytest tests/test_session_service.py -v`
Expected: 전체 PASS (신규 3개 포함).

- [ ] **Step 8: 타입/린트 확인**

Run: `cd backend && uv run ruff check app tests && uv run mypy app`
Expected: 에러 없음.

- [ ] **Step 9: Commit** (git 사용 시)

```bash
git add backend/app/repositories/session_repo.py backend/app/repositories/persona_repo.py backend/app/services/session_service.py backend/app/deps.py backend/tests/test_session_service.py
git commit -m "feat(backend): complete_survey persists completed session + persona"
```

---

## Task 2: `POST /api/sessions/complete` 엔드포인트

**Files:**
- Modify: `backend/app/routers/sessions.py`
- Test: `backend/tests/test_sessions_complete_router.py` (Create)
- Modify: `backend/tests/test_students_profile_router.py` (`_service` 생성자 갱신)

**Interfaces:**
- Consumes: `SessionService.complete_survey`(Task 1), `Persona`(`app/schemas/persona.py`), `ProfileSummary`(`app/schemas/students.py`), `CurrentStudentDep`/`SessionServiceDep`(`app/deps.py`).
- Produces: `POST /api/sessions/complete` → 200 `ProfileSummary` / 401(무인증) / 409(이미 완료·retry off).

- [ ] **Step 1: profile 라우터 테스트의 _service 생성자 갱신**

`backend/tests/test_students_profile_router.py`의 `_service` 헬퍼에 `db_pool` 인자를 추가한다(Task 1에서 생성자에 `db_pool`이 필수가 되었기 때문). 상단 import에 `FakeDBPool` 추가:

```python
from tests.test_session_service import (
    FakeCardRepo,
    FakeDBPool,
    FakePersonaRepo,
    FakeSessionRepo,
    FakeSettingsRepo,
    FakeStorage,
    FakeStudentRepo,
    _persona,
    _session,
    _student,
)
```

`_service` 본문의 `SessionService(...)` 호출에 `db_pool=FakeDBPool(),`를 추가한다.

- [ ] **Step 2: 실패하는 엔드포인트 테스트 작성**

`backend/tests/test_sessions_complete_router.py` 생성:

```python
"""POST /api/sessions/complete 통합 테스트 — fake 서비스 주입, 인증 override."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import httpx

from app.deps import current_student, get_session_service
from app.main import create_app


class FakeService:
    def __init__(self, *, conflict: bool = False) -> None:
        self.conflict = conflict
        self.calls: list[tuple] = []

    async def complete_survey(self, student_id, persona):
        from app.core.errors import ConflictError

        self.calls.append((student_id, persona))
        if self.conflict:
            raise ConflictError("이미 설문을 완료했습니다.")
        from app.schemas.students import PersonaSummary, ProfileSummary

        return ProfileSummary(
            has_completed=True,
            retry_enabled=False,
            student=None,
            persona=PersonaSummary(
                name=persona.name,
                tagline=persona.tagline,
                keywords=list(persona.keywords),
                fields=list(persona.fields),
            ),
            card=None,
        )


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _app_with(service: FakeService):
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: service
    app.dependency_overrides[current_student] = lambda: uuid4()
    return app


_BODY = {
    "name": "숲을 지키는 드론전문가",
    "tagline": "자연과 기술을 잇는 사람",
    "keywords": ["자연", "기술"],
    "fields": ["환경"],
}


async def test_complete_returns_profile_summary() -> None:
    service = FakeService()
    gen = _client(_app_with(service))
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["has_completed"] is True
        assert body["persona"]["name"] == "숲을 지키는 드론전문가"
        assert len(service.calls) == 1
    finally:
        await gen.aclose()


async def test_complete_conflict_returns_409() -> None:
    gen = _client(_app_with(FakeService(conflict=True)))
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 409, res.text
        assert res.json()["error"]["code"] == "conflict"
    finally:
        await gen.aclose()


async def test_complete_requires_auth() -> None:
    app = create_app()
    app.dependency_overrides[get_session_service] = lambda: FakeService()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/sessions/complete", json=_BODY)
        assert res.status_code == 401
    finally:
        await gen.aclose()
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `cd backend && uv run pytest tests/test_sessions_complete_router.py -v`
Expected: FAIL (엔드포인트 `/api/sessions/complete` 없음 → 404/405).

- [ ] **Step 4: 엔드포인트 구현**

`backend/app/routers/sessions.py`를 아래로 교체(기존 stub 3개는 유지, complete 추가):

```python
"""/api/sessions — 세션 완료 저장, (미구현) 질문 진행·답변."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.deps import CurrentStudentDep, SessionServiceDep
from app.schemas.persona import Persona
from app.schemas.students import ProfileSummary

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/complete", response_model=ProfileSummary)
async def complete_survey(
    student_id: CurrentStudentDep,
    sessions: SessionServiceDep,
    persona: Persona,
) -> ProfileSummary:
    """페르소나 선택 확정 → 완료 세션 + 페르소나 저장 후 프로필 요약 반환.

    이미 완료 + retry off → 409.
    """
    return await sessions.complete_survey(student_id, persona)


@router.post("")
async def start_session() -> dict[str, str]:
    """입력 모드 선택 후 세션 생성."""
    raise NotImplementedError


@router.get("/{session_id}/next-question")
async def next_question(session_id: UUID) -> dict[str, object]:
    """다음 질문 반환. 적응형/최종 질문은 AI 호출(동기) 후 응답."""
    raise NotImplementedError


@router.post("/{session_id}/answers")
async def submit_answer(session_id: UUID) -> dict[str, object]:
    """현재 질문에 대한 답변 저장.

    Q6 제출 시 AI-01(해석) + AI-02(Q7~9 생성)를 동기로 호출하고 결과 함께 반환.
    """
    raise NotImplementedError
```

> 주의: `/complete`(정적 경로)를 `/{session_id}/...`(동적 경로)보다 먼저 선언해 경로 충돌을 피한다.

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `cd backend && uv run pytest tests/test_sessions_complete_router.py tests/test_students_profile_router.py -v`
Expected: 전체 PASS.

- [ ] **Step 6: 전체 백엔드 테스트 + 린트/타입**

Run: `cd backend && uv run pytest && uv run ruff check app tests && uv run mypy app`
Expected: 전체 PASS, 에러 없음.

- [ ] **Step 7: Commit** (git 사용 시)

```bash
git add backend/app/routers/sessions.py backend/tests/test_sessions_complete_router.py backend/tests/test_students_profile_router.py
git commit -m "feat(backend): add POST /api/sessions/complete endpoint"
```

---

## Task 3: 프론트 `completeSurvey` API 클라이언트

**Files:**
- Modify: `frontend/lib/api.ts`
- Test: `frontend/lib/api.test.ts` (Create)

**Interfaces:**
- Consumes: 기존 `request()`, `ProfileSummary`, `API_BASE_URL`(모두 `lib/api.ts`).
- Produces:
  - `interface PersonaInput { name: string; tagline: string; keywords: string[]; fields: string[]; }`
  - `completeSurvey(token: string, persona: PersonaInput): Promise<ProfileSummary>` → `POST /api/sessions/complete`.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/lib/api.test.ts` 생성:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeSurvey } from "@/lib/api";

describe("completeSurvey", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs persona to /api/sessions/complete with bearer token", async () => {
    const payload = {
      has_completed: true,
      retry_enabled: false,
      student: null,
      persona: null,
      card: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const persona = { name: "A", tagline: "b", keywords: ["k"], fields: ["f"] };
    const res = await completeSurvey("tok123", persona);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/sessions/complete");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body as string)).toEqual(persona);
    expect(res.has_completed).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd frontend && npx vitest run lib/api.test.ts`
Expected: FAIL (`completeSurvey` export 없음).

- [ ] **Step 3: completeSurvey 구현**

`frontend/lib/api.ts` 끝(`generateStage` 아래)에 추가:

```ts
// 페르소나 선택 확정 → 완료 세션 + 페르소나 저장. 인증 필요.
export interface PersonaInput {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

export function completeSurvey(
  token: string,
  persona: PersonaInput
): Promise<ProfileSummary> {
  return request<ProfileSummary>("/api/sessions/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(persona),
  });
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd frontend && npx vitest run lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (git 사용 시)

```bash
git add frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat(frontend): add completeSurvey API client"
```

---

## Task 4: 프론트 페이지 연동 (mock 제거·완료 호출·로그인 게이트)

**Files:**
- Modify: `frontend/app/explore/interpreting/page.tsx`
- Modify: `frontend/app/explore/path/page.tsx`
- Modify: `frontend/app/explore/page.tsx`

**Interfaces:**
- Consumes: `completeSurvey`/`PersonaInput`(Task 3), `useSessionStore`(`store/useSessionStore.ts`, `studentToken`/`persona`/`setPersona`).

> 참고: 이 페이지들은 현재 테스트 하네스(vitest, node env, `lib/**`만 include)로 단위 테스트할 수 없다. 검증은 `npm run lint` + `npm run build`(타입 체크) + 수동 실행으로 한다.

- [ ] **Step 1: interpreting mock 덮어쓰기 제거**

`frontend/app/explore/interpreting/page.tsx` 수정:
- `import { mockPersonas } from "@/lib/mock/personas";` 라인 삭제.
- `useEffect` 안의 아래 두 줄 삭제:
  ```ts
  const randomPersona = mockPersonas[Math.floor(Math.random() * mockPersonas.length)];
  setPersona(randomPersona);
  ```
- `setPersona`를 더 이상 쓰지 않으면 `const setPersona = useSessionStore(...)` 라인과 useEffect 의존성 배열의 `setPersona`도 제거.
- persona가 없으면 `/explore`로 되돌리는 가드를 useEffect 상단에 추가:
  ```ts
  const persona = useSessionStore((state) => state.persona);
  useEffect(() => {
    if (!persona) {
      router.replace("/explore");
      return;
    }
    // ...기존 키워드 애니메이션 + 3.5초 후 router.push("/explore/result")...
  }, [persona, router]);
  ```
  (기존 `floatingKeywords` 애니메이션 interval과 3.5초 후 `router.push("/explore/result")` 로직은 그대로 유지.)

- [ ] **Step 2: path 페이지 submitQ10에서 completeSurvey 호출**

`frontend/app/explore/path/page.tsx` 수정:
- 상단 import에 `completeSurvey` 추가: `import { generateStage, completeSurvey } from "@/lib/api";`(기존 generateStage import 라인에 병합).
- 스토어에서 토큰 셀렉터 추가: `const studentToken = useSessionStore((s) => s.studentToken);`
- `submitQ10`을 async로 바꾸고, `setPersona` 후 완료 저장을 호출:
  ```ts
  const submitQ10 = async () => {
    if (!q10Data || !nameId) return;
    const card = q10Data.name_cards.find((c) => c.name_id === nameId)!;
    setQ10Selection(card);
    const b = store.q7bSelection;
    const keywords = [
      ...(store.q8Selection?.chips.map((c) => c.text) ?? []),
      ...(store.q9Selection?.chips.map((c) => c.text) ?? []),
    ].slice(0, 5);
    const fields = [card.materials_used_backend?.field ?? pairCode ?? ""].filter(Boolean);
    setPersona({
      name: card.persona_name,
      tagline: card.short_description,
      keywords,
      fields,
      recommendedBooths: [
        ...(b?.first.career_pool ?? []),
        ...(b?.second.career_pool ?? []),
      ].slice(0, 3),
    });
    if (!studentToken) {
      router.push("/login");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await completeSurvey(studentToken, {
        name: card.persona_name,
        tagline: card.short_description,
        keywords,
        fields,
      });
      router.push("/explore/interpreting");
    } catch {
      setError("결과 저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  };
  ```
  (`setGenerating`/`setError`는 이미 이 컴포넌트에 존재. 저장하는 페르소나 payload는 name/tagline/keywords/fields만 — booths는 DB 스키마에 없음.)

- [ ] **Step 3: explore 진입 로그인 게이트**

`frontend/app/explore/page.tsx` 수정(이미 `"use client"`):
- import 추가: `import { useEffect } from "react";`, `import { useSessionStore } from "@/store/useSessionStore";`
- 컴포넌트 상단에 게이트 추가:
  ```ts
  const studentToken = useSessionStore((s) => s.studentToken);
  useEffect(() => {
    if (!studentToken) router.replace("/login");
  }, [studentToken, router]);
  if (!studentToken) return null;
  ```
  (기존 `signup/photo/page.tsx`의 패턴과 동일.)

- [ ] **Step 4: 린트 + 타입/빌드 확인**

Run: `cd frontend && npm run lint && npm run build`
Expected: 린트 통과, 빌드 성공(타입 에러 없음).

- [ ] **Step 5: 수동 검증**

1. 백엔드 실행(`OPENROUTER_API_KEY`·DB 설정 필요), 프론트 `npm run dev`.
2. 회원가입/로그인 → `/explore` 진입(토큰 없으면 `/login`으로 튕기는지 확인).
3. Q1~6 → Q7~10 진행 → Q10에서 후보 1개 선택.
4. `interpreting` → `result`/`card`에 **Q10에서 고른 그 페르소나**가 뜨는지 확인(랜덤 mock 아님).
5. `/profile/[id]` 재방문 시 `has_completed=true`로 같은 페르소나가 유지되는지 확인(새로고침 후에도 백엔드에서 조회).

- [ ] **Step 6: Commit** (git 사용 시)

```bash
git add frontend/app/explore/interpreting/page.tsx frontend/app/explore/path/page.tsx frontend/app/explore/page.tsx
git commit -m "feat(frontend): persist persona on Q10, drop mock overwrite, gate explore"
```

---

## Self-Review 결과

- **Spec 커버리지:** §5.1 라우터→Task 2, §5.2 서비스→Task 1, §5.3 저장소→Task 1, §6.1 interpreting→Task 4, §6.2 api→Task 3, §6.3 submitQ10→Task 4, §6.4 게이트→Task 4. 모든 스펙 항목에 대응 태스크 존재.
- **Placeholder:** 모든 코드 스텝에 실제 코드/명령/기대 출력 포함. TBD/TODO 없음.
- **타입 일관성:** `complete_survey(student_id, persona)` 시그니처가 Task 1(정의)·Task 2(라우터 호출)·Task 3(프론트 payload)에서 일치. repo `create` 인자(`status`/`conn`, `session_id`/`persona`/`conn`)가 정의·호출부 일치. `completeSurvey`/`PersonaInput` 이름 Task 3·4 일치.
