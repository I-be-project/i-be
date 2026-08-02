# 관리자 부스 관리 + 부스별 QR 발급 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 체험 부스를 등록·수정·삭제하고, 부스마다 고유 코드가 박힌 QR 링크와 인쇄용 PNG를 받을 수 있게 한다.

**Architecture:** 백엔드는 기존 `router → service → repository` 3계층을 그대로 따른다. 부스는 `ops.booths` 테이블 하나이고, 서비스가 6자 코드를 발급하고 `FRONTEND_ORIGIN` 기준으로 `qr_url`을 조립해 내려준다. 프론트는 받은 `qr_url` 문자열을 그대로 QR로 렌더할 뿐 링크를 조립하지 않는다.

**Tech Stack:** FastAPI · asyncpg(Supabase Postgres) · Pydantic v2 · pytest / Next.js 16 App Router · TypeScript · Tailwind 4 · shadcn/ui(base-nova) · vitest · `qrcode` npm

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-02-admin-booth-qr-design.md`. 이 계획과 충돌하면 스펙이 우선이다.
- 작업 브랜치는 현재 브랜치 `feat/booth-manage`. PR base는 `production`.
- 커밋 메시지는 Conventional Commits 접두사 + 한국어 한 줄. `🤖 Generated with Claude Code` 같은 자동 생성 푸터·서명을 넣지 않는다.
- 백엔드 품질 게이트 (backend 디렉터리에서 실행): `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app` · `uv run pytest`
- 프론트 품질 게이트 (frontend 디렉터리에서 실행): `npm run lint` · `npm run test` · `npm run build`
- 백엔드는 mypy `strict` 기준. `# type: ignore`를 쓰면 같은 줄이나 바로 위에 사유 주석을 남긴다.
- ruff `line-length = 100`, `target-version = "py312"`. 파이썬 파일은 `from __future__ import annotations`로 시작한다.
- 부스 코드 알파벳은 `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31자), 길이 6자. 이 값은 백엔드·프론트 어디서도 다르게 쓰지 않는다.
- QR 링크 형식은 `{FRONTEND_ORIGIN}/b/{code}`. 운영 값은 `https://i-be.vercel.app`.
- 발급된 `code`는 불변이다. 수정 API·수정 UI 어디에도 code 입력란을 두지 않는다.
- UI 텍스트·주석·문서는 한국어.
- 프론트 의존성은 npm으로만 추가하고 `package-lock.json`을 함께 커밋한다.

---

### Task 1: 부스 코드 생성 유틸

순수 함수라 DB 없이 검증된다. 이후 모든 태스크가 이 알파벳 상수를 참조한다.

**Files:**
- Create: `backend/app/core/booth_code.py`
- Test: `backend/tests/test_booth_code.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `BOOTH_CODE_ALPHABET: str` — `"23456789ABCDEFGHJKMNPQRSTUVWXYZ"`
  - `BOOTH_CODE_LENGTH: int` — `6`
  - `generate_booth_code() -> str`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_booth_code.py`:

```python
"""부스 코드 생성 — 길이·알파벳·혼동 문자 제외 검증."""

from __future__ import annotations

from app.core.booth_code import (
    BOOTH_CODE_ALPHABET,
    BOOTH_CODE_LENGTH,
    generate_booth_code,
)


def test_generated_code_has_fixed_length() -> None:
    assert len(generate_booth_code()) == BOOTH_CODE_LENGTH


def test_generated_code_uses_only_allowed_alphabet() -> None:
    for _ in range(200):
        assert set(generate_booth_code()) <= set(BOOTH_CODE_ALPHABET)


def test_alphabet_excludes_confusable_characters() -> None:
    """인쇄물을 보고 손으로 입력할 수 있어야 하므로 0/O, 1/I/L을 뺀다."""
    for ch in "01OIL":
        assert ch not in BOOTH_CODE_ALPHABET


def test_generated_codes_are_not_repeated() -> None:
    """31^6 ≈ 8.9억 조합이라 100개를 뽑아 겹칠 확률은 무시할 수준이다."""
    codes = {generate_booth_code() for _ in range(100)}
    assert len(codes) == 100
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

backend 디렉터리에서 실행: `uv run pytest tests/test_booth_code.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.booth_code'`

- [ ] **Step 3: 최소 구현 작성**

`backend/app/core/booth_code.py`:

```python
"""부스 코드 생성.

QR이 안 읽힐 때 학생이 인쇄물의 코드를 손으로 입력할 수 있어야 하므로,
혼동하기 쉬운 문자(0/O, 1/I/L)를 알파벳에서 제외한다.
"""

from __future__ import annotations

import secrets

BOOTH_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
BOOTH_CODE_LENGTH = 6


def generate_booth_code() -> str:
    """추측하기 어려운 6자 부스 코드 1개. 31^6 ≈ 8.9억 조합."""
    return "".join(secrets.choice(BOOTH_CODE_ALPHABET) for _ in range(BOOTH_CODE_LENGTH))
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `uv run pytest tests/test_booth_code.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: 품질 게이트**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app`
Expected: 모두 통과. `ruff format --check`가 실패하면 `uv run ruff format .`을 돌리고 다시 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add backend/app/core/booth_code.py backend/tests/test_booth_code.py
git commit -m "feat: 부스 코드 생성 유틸 추가"
```

---

### Task 2: 마이그레이션 + BoothRepository

기존 리포지토리는 실 DB 테스트가 없다(서비스 테스트에서 Fake로 대체). 이 태스크도 같은 관례를 따르며, 검증은 mypy·ruff와 다음 태스크의 서비스 테스트가 대신한다.

**Files:**
- Create: `backend/supabase/migrations/0007_create_booths.sql`
- Create: `backend/app/repositories/booth_repo.py`

**Interfaces:**
- Consumes: `app.repositories.base.BaseRepository`
- Produces:
  - `BoothRecord` — frozen dataclass: `id: UUID`, `code: str`, `name: str`, `description: str | None`, `created_at: datetime`, `updated_at: datetime`
  - `BoothRepository.create(*, code: str, name: str, description: str | None) -> BoothRecord`
  - `BoothRepository.get(booth_id: UUID) -> BoothRecord | None`
  - `BoothRepository.list_all() -> list[BoothRecord]`
  - `BoothRepository.update(booth_id: UUID, *, name: str, description: str | None) -> BoothRecord | None`
  - `BoothRepository.delete(booth_id: UUID) -> bool`

- [ ] **Step 1: 마이그레이션 파일 작성**

`backend/supabase/migrations/0007_create_booths.sql`:

```sql
-- ops 스키마 — 행사장 체험 부스.
--
-- code: QR 링크(https://<프론트 오리진>/b/<code>)에 박히는 6자 코드.
--   인쇄물이 이미 현장에 나가 있으므로 발급 후 변경하지 않는다(수정 API에서 제외).
-- is_active 같은 노출 스위치는 두지 않는다. 부스를 막는 수단은 삭제뿐이다.
-- 학생 방문 기록(ops.booth_visits)은 다음 단계이며 이 마이그레이션 범위가 아니다.

create schema if not exists ops;

-- gen_random_uuid(): 0002에서 pgcrypto를 만들지만, 이 파일만 단독 실행해도 되게 보장한다.
create extension if not exists pgcrypto;

create table if not exists ops.booths (
    id          uuid        primary key default gen_random_uuid(),
    code        text        not null unique,
    name        text        not null,
    description text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
```

- [ ] **Step 2: 리포지토리 작성**

`backend/app/repositories/booth_repo.py`:

```python
"""ops.booths 접근 — 부스 CRUD.

code는 unique. 생성 시 충돌하면 asyncpg.UniqueViolationError가 그대로 올라오고,
새 코드로 재시도하는 책임은 BoothService에 있다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from app.repositories.base import BaseRepository

_COLUMNS = "id, code, name, description, created_at, updated_at"


@dataclass(frozen=True, slots=True)
class BoothRecord:
    """ops.booths 한 행."""

    id: UUID
    code: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


def _to_record(row: asyncpg.Record) -> BoothRecord:
    return BoothRecord(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class BoothRepository(BaseRepository):
    async def create(self, *, code: str, name: str, description: str | None) -> BoothRecord:
        """부스 1건 생성. code가 이미 있으면 asyncpg.UniqueViolationError."""
        query = f"""
            insert into ops.booths (code, name, description)
            values ($1, $2, $3)
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code, name, description)
        return _to_record(row)

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        query = f"select {_COLUMNS} from ops.booths where id = $1"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return _to_record(row) if row is not None else None

    async def list_all(self) -> list[BoothRecord]:
        """전체 부스 — 등록 순. 부스는 행사당 수십 개라 페이지네이션을 두지 않는다."""
        query = f"select {_COLUMNS} from ops.booths order by created_at"
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [_to_record(row) for row in rows]

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None
    ) -> BoothRecord | None:
        """이름·설명을 준 값으로 교체. 없는 id면 None.

        부분 수정(보낸 필드만 반영)은 서비스가 기존 값과 병합해 완성값을 넘기는 방식으로 처리한다.
        여기서 coalesce를 쓰면 description을 null로 지우는 요청과 구분할 수 없다.
        """
        query = f"""
            update ops.booths
               set name        = $2,
                   description = $3,
                   updated_at  = now()
             where id = $1
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id, name, description)
        return _to_record(row) if row is not None else None

    async def delete(self, booth_id: UUID) -> bool:
        """삭제. 실제로 지워졌으면 True, 없던 id면 False."""
        query = "delete from ops.booths where id = $1 returning id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return row is not None
```

- [ ] **Step 3: 타입·린트 검사**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app`
Expected: 모두 통과.

`create`의 `fetchrow` 반환 타입이 `asyncpg.Record | None`이라 mypy strict가 `_to_record(row)`에서
`arg-type` 오류를 낼 수 있다. 그 경우 `create` 본문의 `return` 앞에 다음을 넣는다 — insert가
성공하면 returning은 반드시 한 행을 준다.

```python
        assert row is not None  # insert ... returning은 성공 시 항상 1행
```

- [ ] **Step 4: 기존 테스트가 안 깨졌는지 확인**

Run: `uv run pytest`
Expected: 기존 테스트 전부 PASS (새 테스트는 없음).

- [ ] **Step 5: 커밋**

```bash
git add backend/supabase/migrations/0007_create_booths.sql backend/app/repositories/booth_repo.py
git commit -m "feat: ops.booths 테이블 마이그레이션과 리포지토리 추가"
```

---

### Task 3: 스키마 + BoothService

**Files:**
- Create: `backend/app/schemas/booths.py`
- Create: `backend/app/services/booth_service.py`
- Test: `backend/tests/test_booth_service.py`

**Interfaces:**
- Consumes: `BoothRecord`, `BoothRepository` (Task 2), `generate_booth_code` (Task 1), `app.config.Settings`
- Produces:
  - `BoothCreateRequest(name: str, description: str | None = None)`
  - `BoothUpdateRequest(name: str | None = None, description: str | None = None)`
  - `BoothResponse(id, code, name, description, qr_url, created_at)`
  - `BoothDeleteResponse(booth_id: UUID)`
  - `BoothService(*, booths: BoothRepository, settings: Settings)` — 메서드 `create`, `list_all`, `update`, `delete`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_booth_service.py`:

```python
"""BoothService 단위 테스트 — DB 없이 FakeBoothRepo로 검증."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg
import pytest

from app.config import Settings
from app.core.booth_code import BOOTH_CODE_ALPHABET, BOOTH_CODE_LENGTH
from app.core.errors import ConflictError, NotFoundError
from app.repositories.booth_repo import BoothRecord
from app.schemas.booths import BoothCreateRequest, BoothUpdateRequest
from app.services.booth_service import BoothService


class FakeBoothRepo:
    """BoothRepository 대역. collide_times만큼 create를 code 충돌로 실패시킨다."""

    def __init__(self, *, collide_times: int = 0) -> None:
        self.rows: dict[UUID, BoothRecord] = {}
        self.collide_times = collide_times
        self.attempted_codes: list[str] = []

    async def create(self, *, code: str, name: str, description: str | None) -> BoothRecord:
        self.attempted_codes.append(code)
        if self.collide_times > 0:
            self.collide_times -= 1
            raise asyncpg.UniqueViolationError("duplicate key value violates unique constraint")
        now = datetime.now(UTC)
        record = BoothRecord(
            id=uuid4(),
            code=code,
            name=name,
            description=description,
            created_at=now,
            updated_at=now,
        )
        self.rows[record.id] = record
        return record

    async def get(self, booth_id: UUID) -> BoothRecord | None:
        return self.rows.get(booth_id)

    async def list_all(self) -> list[BoothRecord]:
        return sorted(self.rows.values(), key=lambda r: r.created_at)

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None
    ) -> BoothRecord | None:
        current = self.rows.get(booth_id)
        if current is None:
            return None
        updated = BoothRecord(
            id=current.id,
            code=current.code,
            name=name,
            description=description,
            created_at=current.created_at,
            updated_at=datetime.now(UTC),
        )
        self.rows[booth_id] = updated
        return updated

    async def delete(self, booth_id: UUID) -> bool:
        return self.rows.pop(booth_id, None) is not None


def _service(repo: FakeBoothRepo, *, origin: str = "https://i-be.vercel.app") -> BoothService:
    settings = Settings(frontend_origin=origin)
    # FakeBoothRepo는 BoothRepository의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    return BoothService(booths=repo, settings=settings)  # type: ignore[arg-type]


async def test_create_issues_code_and_qr_url() -> None:
    repo = FakeBoothRepo()
    res = await _service(repo).create(BoothCreateRequest(name="드론 체험"))

    assert len(res.code) == BOOTH_CODE_LENGTH
    assert set(res.code) <= set(BOOTH_CODE_ALPHABET)
    assert res.qr_url == f"https://i-be.vercel.app/b/{res.code}"
    assert res.name == "드론 체험"
    assert res.description is None


async def test_qr_url_strips_trailing_slash_from_origin() -> None:
    repo = FakeBoothRepo()
    res = await _service(repo, origin="https://i-be.vercel.app/").create(
        BoothCreateRequest(name="환경 체험")
    )

    assert res.qr_url == f"https://i-be.vercel.app/b/{res.code}"


async def test_create_retries_on_code_collision() -> None:
    """코드가 겹쳐도 사용자에게 실패를 보이지 않고 새 코드로 다시 시도한다."""
    repo = FakeBoothRepo(collide_times=2)
    res = await _service(repo).create(BoothCreateRequest(name="안전 체험"))

    assert len(repo.attempted_codes) == 3
    assert res.code == repo.attempted_codes[-1]


async def test_create_gives_up_after_max_attempts() -> None:
    repo = FakeBoothRepo(collide_times=99)

    with pytest.raises(ConflictError):
        await _service(repo).create(BoothCreateRequest(name="실패 부스"))


async def test_update_changes_name_and_keeps_code() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    created = await service.create(BoothCreateRequest(name="드론 체험", description="설명"))

    updated = await service.update(created.id, BoothUpdateRequest(name="드론 조종 체험"))

    assert updated.name == "드론 조종 체험"
    assert updated.description == "설명"
    assert updated.code == created.code


async def test_update_can_clear_description_with_explicit_null() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    created = await service.create(BoothCreateRequest(name="드론 체험", description="설명"))

    updated = await service.update(created.id, BoothUpdateRequest(description=None))

    assert updated.description is None
    assert updated.name == "드론 체험"


async def test_update_missing_booth_raises_not_found() -> None:
    repo = FakeBoothRepo()

    with pytest.raises(NotFoundError):
        await _service(repo).update(uuid4(), BoothUpdateRequest(name="없음"))


async def test_delete_missing_booth_raises_not_found() -> None:
    repo = FakeBoothRepo()

    with pytest.raises(NotFoundError):
        await _service(repo).delete(uuid4())


async def test_list_all_returns_created_booths() -> None:
    repo = FakeBoothRepo()
    service = _service(repo)
    await service.create(BoothCreateRequest(name="부스1"))
    await service.create(BoothCreateRequest(name="부스2"))

    items = await service.list_all()

    assert [b.name for b in items] == ["부스1", "부스2"]
```

주의 — `BoothUpdateRequest(description=None)`은 "명시적으로 null을 보냄"이라 `model_fields_set`에
`description`이 들어간다. `BoothUpdateRequest(name="...")`처럼 아예 빼면 안 들어간다.
서비스는 이 차이로 "설명 지우기"와 "설명 유지"를 구분한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `uv run pytest tests/test_booth_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.booths'`

- [ ] **Step 3: 스키마 작성**

`backend/app/schemas/booths.py`:

```python
"""booths 라우터용 Request/Response 모델."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _normalize_name(value: str) -> str:
    """앞뒤 공백을 떼고, 공백만 남으면 거부한다."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("부스 이름을 입력해주세요.")
    return stripped


def _normalize_description(value: str | None) -> str | None:
    """공백만 남은 설명은 없는 것으로 본다."""
    if value is None:
        return None
    return value.strip() or None


class BoothCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="부스 이름")
    description: str | None = Field(None, max_length=500, description="부스 설명(선택)")

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)


class BoothUpdateRequest(BaseModel):
    """부분 수정 — 보내지 않은 필드는 기존 값을 유지한다.

    description에 null을 명시하면 설명이 지워진다(서비스가 model_fields_set으로 구분).
    code는 인쇄물에 박혀 있어 변경할 수 없으므로 필드 자체를 두지 않는다.
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str | None) -> str | None:
        return None if value is None else _normalize_name(value)

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)


class BoothResponse(BaseModel):
    id: UUID
    code: str = Field(..., description="6자 부스 코드 — 발급 후 불변")
    name: str
    description: str | None = None
    qr_url: str = Field(..., description="QR에 담을 링크 (FRONTEND_ORIGIN 기준)")
    created_at: datetime


class BoothDeleteResponse(BaseModel):
    booth_id: UUID
```

- [ ] **Step 4: 서비스 작성**

`backend/app/services/booth_service.py`:

```python
"""부스 CRUD 서비스 — 코드 발급과 QR 링크 조립을 담당한다."""

from __future__ import annotations

from uuid import UUID

import asyncpg

from app.config import Settings
from app.core.booth_code import generate_booth_code
from app.core.errors import ConflictError, NotFoundError
from app.repositories.booth_repo import BoothRecord, BoothRepository
from app.schemas.booths import (
    BoothCreateRequest,
    BoothDeleteResponse,
    BoothResponse,
    BoothUpdateRequest,
)

# 31^6 조합이라 충돌은 사실상 나지 않지만, 나더라도 관리자에게 실패를 보이지 않게 재시도한다.
_CODE_MAX_ATTEMPTS = 5


class BoothService:
    def __init__(self, *, booths: BoothRepository, settings: Settings) -> None:
        self._booths = booths
        self._settings = settings

    def _qr_url(self, code: str) -> str:
        """QR에 담을 링크. base는 FRONTEND_ORIGIN 한 곳에서만 정한다.

        프론트에서 window.location.origin으로 조립하면 관리자가 로컬 개발 서버에서 뽑은
        인쇄물에 localhost가 박힌다. 인쇄물은 되돌릴 수 없으므로 서버가 조립해 내려준다.
        """
        return f"{self._settings.frontend_origin.rstrip('/')}/b/{code}"

    def _to_response(self, record: BoothRecord) -> BoothResponse:
        return BoothResponse(
            id=record.id,
            code=record.code,
            name=record.name,
            description=record.description,
            qr_url=self._qr_url(record.code),
            created_at=record.created_at,
        )

    async def create(self, req: BoothCreateRequest) -> BoothResponse:
        """부스 생성 — 코드를 발급하고, 충돌하면 새 코드로 재시도한다."""
        for _ in range(_CODE_MAX_ATTEMPTS):
            try:
                record = await self._booths.create(
                    code=generate_booth_code(),
                    name=req.name,
                    description=req.description,
                )
            except asyncpg.UniqueViolationError:
                continue
            return self._to_response(record)
        raise ConflictError("부스 코드를 발급하지 못했습니다. 다시 시도해주세요.")

    async def list_all(self) -> list[BoothResponse]:
        """전체 부스 목록 — 등록 순."""
        records = await self._booths.list_all()
        return [self._to_response(record) for record in records]

    async def update(self, booth_id: UUID, req: BoothUpdateRequest) -> BoothResponse:
        """보낸 필드만 반영한다. description에 null을 명시하면 설명이 지워진다.

        조회 후 갱신이라 이론상 경합이 있지만, 관리자 단일 계정이 쓰는 화면이라 허용한다.
        """
        current = await self._booths.get(booth_id)
        if current is None:
            raise NotFoundError("부스를 찾을 수 없습니다.")

        provided = req.model_fields_set
        name = req.name if "name" in provided and req.name is not None else current.name
        description = req.description if "description" in provided else current.description

        updated = await self._booths.update(booth_id, name=name, description=description)
        if updated is None:
            raise NotFoundError("부스를 찾을 수 없습니다.")
        return self._to_response(updated)

    async def delete(self, booth_id: UUID) -> BoothDeleteResponse:
        if not await self._booths.delete(booth_id):
            raise NotFoundError("부스를 찾을 수 없습니다.")
        return BoothDeleteResponse(booth_id=booth_id)
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `uv run pytest tests/test_booth_service.py -v`
Expected: PASS (9 passed)

- [ ] **Step 6: 품질 게이트 + 전체 테스트**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 모두 통과.

- [ ] **Step 7: 커밋**

```bash
git add backend/app/schemas/booths.py backend/app/services/booth_service.py backend/tests/test_booth_service.py
git commit -m "feat: 부스 스키마와 코드 발급·QR 링크 서비스 추가"
```

---

### Task 4: 라우터 + 의존성 + 앱 등록

**Files:**
- Create: `backend/app/routers/booths.py`
- Modify: `backend/app/deps.py` (파일 끝, `CurrentAdminDep` 정의 뒤)
- Modify: `backend/app/main.py:19` (라우터 import), `backend/app/main.py:96` 부근 (`include_router` 목록)
- Test: `backend/tests/test_booths_router.py`

**Interfaces:**
- Consumes: `BoothService` (Task 3), `CurrentAdminDep`·`DBPoolDep`·`SettingsDep` (`app/deps.py`)
- Produces:
  - `get_booth_service` — 테스트에서 `app.dependency_overrides` 키로 쓴다
  - `BoothServiceDep`
  - 엔드포인트: `POST /api/admin/booths`(201) · `GET /api/admin/booths` · `PATCH /api/admin/booths/{booth_id}` · `DELETE /api/admin/booths/{booth_id}`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_booths_router.py`:

```python
"""/api/admin/booths 통합 테스트 — fake 리포지토리 주입, 실 DB 없음."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from uuid import uuid4

import httpx

from app.config import get_settings
from app.core.security import TokenKind, create_token
from app.deps import get_booth_service
from app.main import create_app
from app.services.booth_service import BoothService
from tests.test_booth_service import FakeBoothRepo


def _build() -> tuple[object, FakeBoothRepo]:
    repo = FakeBoothRepo()
    # FakeBoothRepo는 BoothRepository의 구조적 대역이다(DB 풀 없이 같은 메서드만 제공).
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    app = create_app()
    app.dependency_overrides[get_booth_service] = lambda: service
    return app, repo


async def _client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _admin_token() -> str:
    return create_token(
        kind=TokenKind.ADMIN,
        subject="admin",
        ttl=timedelta(hours=1),
        settings=get_settings(),
    )


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {_admin_token()}"}


async def test_create_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/admin/booths", json={"name": "드론 체험"})
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_list_requires_admin_token() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.get("/api/admin/booths")
        assert res.status_code == 401
    finally:
        await gen.aclose()


async def test_create_returns_code_and_qr_url() -> None:
    settings = get_settings()
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post(
            "/api/admin/booths",
            json={"name": "드론 체험", "description": "드론을 직접 조종해보는 부스"},
            headers=_auth(),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert len(body["code"]) == 6
        assert body["qr_url"] == f"{settings.frontend_origin.rstrip('/')}/b/{body['code']}"
        assert body["name"] == "드론 체험"
    finally:
        await gen.aclose()


async def test_create_rejects_blank_name() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.post("/api/admin/booths", json={"name": "   "}, headers=_auth())
        assert res.status_code == 422
    finally:
        await gen.aclose()


async def test_list_returns_created_booths() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        await client.post("/api/admin/booths", json={"name": "부스2"}, headers=_auth())

        res = await client.get("/api/admin/booths", headers=_auth())
        assert res.status_code == 200, res.text
        assert [b["name"] for b in res.json()] == ["부스1", "부스2"]
    finally:
        await gen.aclose()


async def test_patch_ignores_code_and_keeps_it() -> None:
    """code는 요청 스키마에 없다. 실어 보내도 무시되고 기존 코드가 유지된다."""
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        created = (
            await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        ).json()

        res = await client.patch(
            f"/api/admin/booths/{created['id']}",
            json={"name": "이름 변경", "code": "AAAAAA"},
            headers=_auth(),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "이름 변경"
        assert body["code"] == created["code"]
    finally:
        await gen.aclose()


async def test_patch_missing_booth_returns_404() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.patch(
            f"/api/admin/booths/{uuid4()}", json={"name": "없음"}, headers=_auth()
        )
        assert res.status_code == 404
    finally:
        await gen.aclose()


async def test_delete_removes_booth() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        created = (
            await client.post("/api/admin/booths", json={"name": "부스1"}, headers=_auth())
        ).json()

        res = await client.delete(f"/api/admin/booths/{created['id']}", headers=_auth())
        assert res.status_code == 200, res.text
        assert res.json()["booth_id"] == created["id"]

        remaining = await client.get("/api/admin/booths", headers=_auth())
        assert remaining.json() == []
    finally:
        await gen.aclose()


async def test_delete_missing_booth_returns_404() -> None:
    app, _ = _build()
    gen = _client(app)
    client = await anext(gen)
    try:
        res = await client.delete(f"/api/admin/booths/{uuid4()}", headers=_auth())
        assert res.status_code == 404
    finally:
        await gen.aclose()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `uv run pytest tests/test_booths_router.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_booth_service' from 'app.deps'`

- [ ] **Step 3: 의존성 추가**

`backend/app/deps.py` — import 블록에 두 줄을 추가한다 (기존 import 순서를 유지, ruff의 isort가 정렬한다):

```python
from app.repositories.booth_repo import BoothRepository
from app.services.booth_service import BoothService
```

파일 맨 끝(`CurrentAdminDep = ...` 다음)에 추가:

```python
def get_booth_repo(pool: DBPoolDep) -> BoothRepository:
    return BoothRepository(pool)


def get_booth_service(
    booths: Annotated[BoothRepository, Depends(get_booth_repo)],
    settings: SettingsDep,
) -> BoothService:
    return BoothService(booths=booths, settings=settings)


BoothServiceDep = Annotated[BoothService, Depends(get_booth_service)]
```

- [ ] **Step 4: 라우터 작성**

`backend/app/routers/booths.py`:

```python
"""/api/admin/booths — 부스 등록·조회·수정·삭제와 QR 링크 발급.

부스마다 발급되는 6자 code로 QR 링크를 만든다. code는 인쇄물에 박히므로 수정할 수 없다.
학생이 이 QR을 찍어 완료 인증을 하는 흐름은 다음 단계다.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.deps import BoothServiceDep, CurrentAdminDep
from app.schemas.booths import (
    BoothCreateRequest,
    BoothDeleteResponse,
    BoothResponse,
    BoothUpdateRequest,
)

router = APIRouter(prefix="/api/admin/booths", tags=["booths"])


@router.post("", response_model=BoothResponse, status_code=201)
async def create_booth(
    req: BoothCreateRequest,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothResponse:
    """부스 생성 — 6자 code를 자동 발급하고 QR 링크까지 만들어 반환한다."""
    return await booths.create(req)


@router.get("", response_model=list[BoothResponse])
async def list_booths(
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> list[BoothResponse]:
    """전체 부스 목록(등록 순). 부스는 수십 개 규모라 페이지네이션을 두지 않는다."""
    return await booths.list_all()


@router.patch("/{booth_id}", response_model=BoothResponse)
async def update_booth(
    booth_id: UUID,
    req: BoothUpdateRequest,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothResponse:
    """이름·설명 수정. code는 요청 스키마에 없어 변경할 수 없다."""
    return await booths.update(booth_id, req)


@router.delete("/{booth_id}", response_model=BoothDeleteResponse)
async def delete_booth(
    booth_id: UUID,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothDeleteResponse:
    """부스 삭제. 인쇄된 QR은 이후 무효가 된다."""
    return await booths.delete(booth_id)
```

- [ ] **Step 5: 앱에 라우터 등록**

`backend/app/main.py:19`의 import를 다음으로 바꾼다:

```python
from app.routers import admin, auth, booths, cards, dev, operator, questions, sessions, students
```

`app.include_router(admin.router)` 다음 줄에 추가한다:

```python
    app.include_router(booths.router)
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `uv run pytest tests/test_booths_router.py -v`
Expected: PASS (9 passed)

- [ ] **Step 7: 품질 게이트 + 전체 테스트**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 모두 통과.

- [ ] **Step 8: 커밋**

```bash
git add backend/app/routers/booths.py backend/app/deps.py backend/app/main.py backend/tests/test_booths_router.py
git commit -m "feat: 관리자 부스 CRUD API 추가"
```

---

### Task 5: FRONTEND_ORIGIN 운영 가드 + .env.example

`frontend_origin`은 지금까지 선언만 되고 쓰이지 않았다. 이제 QR 링크의 base가 되므로, 운영에서
값이 비어 있으면 `http://localhost:3000`이 인쇄물에 박힌다. 되돌릴 수 없는 사고라 기동을 막는다.

**Files:**
- Modify: `backend/app/config.py:18-23` (`_PRODUCTION_REQUIRED_SECRETS`), `backend/app/config.py:36` (주석), `backend/app/config.py:121-143` (validator 독스트링)
- Modify: `backend/.env.example:39`
- Test: `backend/tests/test_config_production_guard.py`

**Interfaces:**
- Consumes: `Settings.frontend_origin` (기존 필드)
- Produces: `APP_ENV=production`에서 `FRONTEND_ORIGIN` 미설정 시 `ValidationError`

- [ ] **Step 1: 현재 가드 구조 확인**

Run: `sed -n '15,25p;115,145p' backend/app/config.py`
Expected: `_PRODUCTION_REQUIRED_SECRETS` 딕셔너리(필드명 → 환경변수명)와 `_reject_placeholder_secrets`
validator가 보인다. validator는 `getattr(self, field) in ("", 기본값)`으로 미설정을 판단하므로,
기본값이 `http://localhost:3000`인 `frontend_origin`에도 그대로 적용된다.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_config_production_guard.py`를 수정한다.

먼저 `_REAL_SECRETS`에 한 줄 추가(이걸 안 넣으면 기존 통과 케이스가 전부 깨진다):

```python
_REAL_SECRETS = {
    "JWT_SECRET": "b7f3d1c9a2e84f60b5d7c3a1e9f2b8d4",
    "JWT_CARD_SHARE_SECRET": "3a9e1f7c5b2d8046a1c7e3f9b5d2a806",
    "ADMIN_PASSWORD": "a-real-admin-password",
    "FRONTEND_ORIGIN": "https://i-be.vercel.app",
}
```

`test_production_rejects_default_secret`의 `parametrize` 목록에 한 줄 추가:

```python
        ("FRONTEND_ORIGIN", "frontend_origin"),
```

파일 끝에 테스트 하나를 추가:

```python
def test_production_rejects_localhost_frontend_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    """QR 링크의 base라, localhost가 남아 있으면 되돌릴 수 없는 인쇄물이 나온다."""
    _use_production(monkeypatch, FRONTEND_ORIGIN="http://localhost:3000")

    with pytest.raises(ValidationError) as exc:
        Settings()

    assert "FRONTEND_ORIGIN" in str(exc.value)
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `uv run pytest tests/test_config_production_guard.py -v`
Expected: FAIL — `test_production_rejects_localhost_frontend_origin`과 새 parametrize 케이스가
`DID NOT RAISE ValidationError`로 실패한다.

- [ ] **Step 4: 가드에 필드 추가**

`backend/app/config.py`의 `_PRODUCTION_REQUIRED_SECRETS` 딕셔너리에 항목을 추가하고, 이름이 더는
시크릿만 담지 않으므로 상수명을 `_PRODUCTION_REQUIRED_SETTINGS`로 바꾼다. 사용처는 validator 한 곳뿐이다.

```python
# APP_ENV=production에서 반드시 .env로 채워야 하는 설정 (필드명 → 환경변수명).
# 기본값을 그대로 두면 기동을 실패시킨다.
_PRODUCTION_REQUIRED_SETTINGS = {
    "jwt_secret": "JWT_SECRET",
    "jwt_card_share_secret": "JWT_CARD_SHARE_SECRET",
    "admin_password": "ADMIN_PASSWORD",
    "frontend_origin": "FRONTEND_ORIGIN",
}
```

validator 본문의 참조도 바꾼다:

```python
            for field, env_name in _PRODUCTION_REQUIRED_SETTINGS.items()
```

validator 독스트링에 한 문장을 덧붙인다:

```python
        """APP_ENV=production인데 필수 설정이 기본값·빈 값이면 기동을 실패시킨다.

        조용히 뜨면 공개된 플레이스홀더로 학생·관리자 토큰을 서명하게 되므로,
        배포를 실패시켜 헬스체크에서 잡히게 하는 편이 안전하다.
        FRONTEND_ORIGIN도 같은 이유다 — 부스 QR 링크의 base라, localhost가 박힌 인쇄물이
        현장에 나가면 되돌릴 수 없다.
        local/staging에서는 개발 편의를 위해 기본값을 그대로 허용한다.
        """
```

`config.py:36`의 필드 선언에도 용도를 남긴다:

```python
    # 프론트 오리진 — 부스 QR 링크(/b/<code>)의 base. 운영에서는 반드시 .env로 채운다.
    frontend_origin: str = "http://localhost:3000"
```

- [ ] **Step 5: `.env.example` 갱신**

`backend/.env.example:39`의 줄을 다음으로 바꾼다:

```
FRONTEND_ORIGIN=https://i-be.vercel.app   # 부스 QR 링크의 base. production에서 필수(가드 대상)
```

주석 해제 상태로 둔다 — production에서 필수라 예시가 주석 처리돼 있으면 놓치기 쉽다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `uv run pytest tests/test_config_production_guard.py -v`
Expected: PASS

- [ ] **Step 7: 품질 게이트 + 전체 테스트**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 모두 통과. 다른 테스트가 `APP_ENV=production`으로 `Settings()`를 만든다면 여기서 드러난다 —
그 테스트에도 `FRONTEND_ORIGIN`을 넣어 고친다.

- [ ] **Step 8: 배포 메모 남기고 커밋**

`DEPLOYMENT.md`의 환경변수 관련 절에 한 줄을 추가한다 (해당 절이 없으면 문서 하단 변경 이력 위에 추가):

```markdown
- `FRONTEND_ORIGIN` — 부스 QR 링크의 base(`https://i-be.vercel.app`). `APP_ENV=production`에서
  미설정이면 앱이 기동을 거부한다. localhost가 박힌 QR 인쇄물을 막기 위한 가드다.
```

```bash
git add backend/app/config.py backend/.env.example backend/tests/test_config_production_guard.py DEPLOYMENT.md
git commit -m "chore: FRONTEND_ORIGIN을 QR 링크 base로 쓰고 운영 필수값으로 가드"
```

---

### Task 6: 프론트 API 클라이언트

**Files:**
- Modify: `frontend/lib/api.ts` (파일 끝, 기존 admin 함수들 뒤)
- Test: `frontend/lib/api.test.ts` (파일 끝)

**Interfaces:**
- Consumes: `request` 헬퍼(`lib/api.ts:135`), Task 4의 엔드포인트
- Produces:
  - `interface AdminBooth { id, code, name, description, qr_url, created_at }` — 전부 문자열, `description`만 `string | null`
  - `fetchAdminBooths(token: string): Promise<AdminBooth[]>`
  - `createAdminBooth(token: string, payload: { name: string; description: string | null }): Promise<AdminBooth>`
  - `updateAdminBooth(token: string, boothId: string, payload: { name?: string; description?: string | null }): Promise<AdminBooth>`
  - `deleteAdminBooth(token: string, boothId: string): Promise<{ booth_id: string }>`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/lib/api.test.ts`의 import 목록에 네 함수를 추가하고, 파일 끝에 다음을 붙인다:

```ts
describe("부스 관리 API", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  const booth = {
    id: "b1",
    code: "K7M2QX",
    name: "드론 체험",
    description: null,
    qr_url: "https://i-be.vercel.app/b/K7M2QX",
    created_at: "2026-08-02T09:00:00Z",
  };

  it("GETs /api/admin/booths with bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([booth]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAdminBooths("tok123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res[0].qr_url).toBe("https://i-be.vercel.app/b/K7M2QX");
  });

  it("POSTs name and description to /api/admin/booths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booth), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdminBooth("tok123", { name: "드론 체험", description: null });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "드론 체험",
      description: null,
    });
  });

  it("PATCHes /api/admin/booths/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booth), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateAdminBooth("tok123", "b1", { name: "새 이름" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths/b1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "새 이름" });
  });

  it("DELETEs /api/admin/booths/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ booth_id: "b1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await deleteAdminBooth("tok123", "b1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths/b1");
    expect(init.method).toBe("DELETE");
    expect(res.booth_id).toBe("b1");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

frontend 디렉터리에서 실행: `npm run test`
Expected: FAIL — `lib/api.ts`에 해당 export가 없어 import 에러.

- [ ] **Step 3: API 함수 구현**

`frontend/lib/api.ts` 파일 끝에 추가한다:

```ts
// ─── 부스 관리 (관리자) ────────────────────────────────────
// qr_url은 백엔드가 FRONTEND_ORIGIN 기준으로 조립해 내려준다.
// 프론트에서 링크를 다시 만들지 않는다(로컬에서 뽑은 인쇄물에 localhost가 박히는 사고 방지).

export interface AdminBooth {
  id: string;
  code: string;
  name: string;
  description: string | null;
  qr_url: string;
  created_at: string;
}

export interface AdminBoothCreatePayload {
  name: string;
  description: string | null;
}

// 보내지 않은 필드는 서버가 기존 값을 유지한다.
// description에 null을 명시하면 설명이 지워진다.
export interface AdminBoothUpdatePayload {
  name?: string;
  description?: string | null;
}

export function fetchAdminBooths(token: string): Promise<AdminBooth[]> {
  return request<AdminBooth[]>("/api/admin/booths", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createAdminBooth(
  token: string,
  payload: AdminBoothCreatePayload
): Promise<AdminBooth> {
  return request<AdminBooth>("/api/admin/booths", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function updateAdminBooth(
  token: string,
  boothId: string,
  payload: AdminBoothUpdatePayload
): Promise<AdminBooth> {
  return request<AdminBooth>(`/api/admin/booths/${boothId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deleteAdminBooth(
  token: string,
  boothId: string
): Promise<{ booth_id: string }> {
  return request<{ booth_id: string }>(`/api/admin/booths/${boothId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test`
Expected: PASS (기존 테스트 포함 전부).

- [ ] **Step 5: 린트**

Run: `npm run lint`
Expected: 통과.

- [ ] **Step 6: 커밋**

```bash
git add frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat: 부스 관리 API 클라이언트 함수 추가"
```

---

### Task 7: 부스 관리 화면 (목록·생성·수정·삭제)

QR 렌더는 다음 태스크다. 이 태스크는 CRUD만 동작시키고, 목록에 코드와 링크를 텍스트로 보여준다.

**Files:**
- Create: `frontend/app/admin/booths/page.tsx`
- Create: `frontend/components/admin/BoothFormDialog.tsx`
- Modify: `frontend/components/admin/AdminHeader.tsx:3` (아이콘 import), `:10-13` (`NAV` 배열)

**Interfaces:**
- Consumes: `AdminBooth`·`fetchAdminBooths`·`createAdminBooth`·`updateAdminBooth`·`deleteAdminBooth`·`ApiError` (Task 6), `getAdminToken`(`lib/adminAuth.ts`), `AdminHeader`, `Toast`
- Produces:
  - `BoothFormDialog` — props `{ open: boolean; booth: AdminBooth | null; submitting: boolean; error: string | null; onOpenChange: (open: boolean) => void; onSubmit: (values: { name: string; description: string | null }) => void }`. `booth`가 null이면 생성 모드, 있으면 수정 모드.

- [ ] **Step 1: Next.js 16 라우팅 문서 확인**

Run: `ls node_modules/next/dist/docs/`
그중 App Router 페이지 작성 관련 문서를 읽는다. 이 저장소의 `frontend/AGENTS.md`가 코드 작성 전
필수로 요구하는 절차다. 기존 `app/admin/seating/page.tsx`도 같이 열어 패턴을 맞춘다.

- [ ] **Step 2: 폼 다이얼로그 컴포넌트 작성**

`frontend/components/admin/BoothFormDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminBooth } from "@/lib/api";

interface BoothFormDialogProps {
  open: boolean;
  /** null이면 생성, 값이 있으면 그 부스 수정. */
  booth: AdminBooth | null;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string; description: string | null }) => void;
}

/** 부스 생성·수정 폼. 코드는 발급 후 불변이라 입력란을 두지 않고 읽기 전용으로만 보여준다. */
export function BoothFormDialog({
  open,
  booth,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: BoothFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // 다이얼로그가 열릴 때마다 대상 부스 값으로 폼을 초기화한다.
  useEffect(() => {
    if (!open) return;
    setName(booth?.name ?? "");
    setDescription(booth?.description ?? "");
  }, [open, booth]);

  const trimmedName = name.trim();

  function handleSubmit() {
    if (!trimmedName || submitting) return;
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{booth ? "부스 수정" : "부스 추가"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {booth && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">코드</p>
              <p className="font-mono text-sm text-muted-foreground">
                {booth.code}
              </p>
              <p className="text-xs text-muted-foreground">
                코드는 인쇄물에 박혀 있어 변경할 수 없어요.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="booth-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="booth-name"
              value={name}
              maxLength={100}
              placeholder="예: 드론 체험"
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="booth-description" className="text-sm font-medium">
              설명 <span className="text-muted-foreground">(선택)</span>
            </label>
            <Textarea
              id="booth-description"
              value={description}
              maxLength={500}
              rows={3}
              placeholder="부스에서 무엇을 하는지 한 줄로"
              disabled={submitting}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={submitting || !trimmedName}
            onClick={handleSubmit}
          >
            {booth ? "저장" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 목록 페이지 작성**

`frontend/app/admin/booths/page.tsx`:

```tsx
"use client";

import { Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BoothFormDialog } from "@/components/admin/BoothFormDialog";
import { Toast, type ToastVariant } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminToken } from "@/lib/adminAuth";
import {
  ApiError,
  createAdminBooth,
  deleteAdminBooth,
  fetchAdminBooths,
  updateAdminBooth,
  type AdminBooth,
} from "@/lib/api";

export default function AdminBoothsPage() {
  const router = useRouter();
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBooth | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setLoading(true);
    try {
      setBooths(await fetchAdminBooths(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setToast({
        message:
          err instanceof ApiError ? err.message : "부스를 불러오지 못했어요.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(booth: AdminBooth) {
    setEditing(booth);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(values: {
    name: string;
    description: string | null;
  }) {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAdminBooth(token, editing.id, values);
      } else {
        await createAdminBooth(token, values);
      }
      setFormOpen(false);
      setToast({
        message: editing ? "부스를 수정했어요." : "부스를 추가했어요.",
        variant: "info",
      });
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "저장하지 못했어요."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(booth: AdminBooth) {
    // 인쇄된 QR이 무효가 되므로 한 번 되묻는다.
    const ok = window.confirm(
      `'${booth.name}' 부스를 삭제할까요?\n이미 인쇄한 QR(${booth.code})은 더 이상 동작하지 않아요.`
    );
    if (!ok) return;

    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    try {
      await deleteAdminBooth(token, booth.id);
      setToast({ message: "부스를 삭제했어요.", variant: "info" });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "삭제하지 못했어요.",
        variant: "error",
      });
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">부스 관리</h1>
            <p className="text-sm text-muted-foreground">
              부스를 등록하면 QR 링크가 자동으로 발급돼요.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            부스 추가
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : booths.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-muted-foreground">
            <Inbox className="size-8" aria-hidden />
            <p className="text-sm">아직 등록한 부스가 없어요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead>코드</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {booths.map((booth) => (
                  <TableRow key={booth.id}>
                    <TableCell className="font-medium">{booth.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {booth.description ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono">{booth.code}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => openEdit(booth)}
                        >
                          <Pencil className="size-4" aria-hidden />
                          수정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive"
                          onClick={() => void handleDelete(booth)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <BoothFormDialog
        open={formOpen}
        booth={editing}
        submitting={submitting}
        error={formError}
        onOpenChange={setFormOpen}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: 관리자 내비에 부스 항목 추가**

`frontend/components/admin/AdminHeader.tsx:3`의 import에 `QrCode`를 추가한다:

```tsx
import { LayoutGrid, LogOut, QrCode, Users } from "lucide-react";
```

`:10-13`의 `NAV` 배열에 항목을 추가한다:

```tsx
const NAV = [
  { href: "/admin", label: "회원 목록", icon: Users },
  { href: "/admin/seating", label: "진행 현황", icon: LayoutGrid },
  { href: "/admin/booths", label: "부스 관리", icon: QrCode },
];
```

- [ ] **Step 5: 린트·빌드 확인**

Run: `npm run lint && npm run test && npm run build`
Expected: 모두 통과.

`react-hooks/set-state-in-effect`가 걸리면(`app/admin/layout.tsx:22`에서 이미 한 번 겪은 규칙)
effect 본문에서 setState를 직접 부르지 않도록 고친다. 위 코드는 `load()` 안에서만 setState를
호출하므로 정상적으로는 걸리지 않는다. 규칙을 끄는 것은 마지막 수단이고, 끈다면 해당 라인에서만
사유 주석과 함께 끈다.

- [ ] **Step 6: 화면 수동 확인**

백엔드를 `uv run uvicorn app.main:app --reload`로, 프론트를 `npm run dev`(포트 4000)로 띄운다.
`http://localhost:4000/admin/login`에서 로그인한 뒤 `/admin/booths`로 이동해 확인한다:

1. 상단 내비에 "부스 관리"가 보이고 활성 상태로 표시된다
2. "부스 추가" → 이름만 넣고 저장 → 목록에 나타나고 코드 6자가 보인다
3. 이름을 공백만 넣으면 "추가" 버튼이 비활성이다
4. 수정 다이얼로그에 코드가 읽기 전용으로 보이고 입력란이 없다
5. 삭제하면 확인창이 뜨고, 확인하면 목록에서 사라진다

- [ ] **Step 7: 커밋**

```bash
git add frontend/app/admin/booths/page.tsx frontend/components/admin/BoothFormDialog.tsx frontend/components/admin/AdminHeader.tsx
git commit -m "feat: 관리자 부스 관리 화면 추가"
```

---

### Task 8: QR 미리보기 · 인쇄용 PNG 다운로드 · 링크 복사

**Files:**
- Create: `frontend/lib/boothQr.ts`
- Create: `frontend/components/admin/BoothQrDialog.tsx`
- Modify: `frontend/app/admin/booths/page.tsx` (QR 버튼 + 다이얼로그 연결)
- Modify: `frontend/package.json`, `frontend/package-lock.json` (`qrcode` 의존성)
- Test: `frontend/lib/boothQr.test.ts`

**Interfaces:**
- Consumes: `AdminBooth` (Task 6), Task 7의 목록 페이지
- Produces:
  - `boothQrFilename(code: string): string` — `"booth-K7M2QX.png"`
  - `renderBoothQrPng(qrUrl: string, code: string): Promise<string>` — PNG data URL
  - `BoothQrDialog` — props `{ booth: AdminBooth | null; onOpenChange: (open: boolean) => void }`

- [ ] **Step 1: 의존성 추가**

frontend 디렉터리에서 실행:

```bash
npm install qrcode
npm install -D @types/qrcode
```

`package-lock.json`이 함께 갱신됐는지 `git status`로 확인한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`frontend/lib/boothQr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { boothQrFilename } from "@/lib/boothQr";

describe("boothQrFilename", () => {
  it("코드만으로 파일명을 만든다", () => {
    expect(boothQrFilename("K7M2QX")).toBe("booth-K7M2QX.png");
  });
});
```

`renderBoothQrPng`는 canvas·Image가 필요해 node 환경(`vitest.config.ts`의 `environment: "node"`)에서
돌릴 수 없다. Step 7의 수동 확인으로 검증한다.

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm run test`
Expected: FAIL — `Cannot find module '@/lib/boothQr'`

- [ ] **Step 4: QR 렌더 유틸 작성**

`frontend/lib/boothQr.ts`:

```ts
// 부스 QR 인쇄물 만들기.
// QR 아래에 코드 6자를 함께 그린다 — 카메라가 안 잡힐 때 학생이 손으로 입력할 수 있어야
// 코드에서 혼동 문자(0/O, 1/I/L)를 뺀 설계가 의미를 갖는다.

import QRCode from "qrcode";

const QR_SIZE = 1024;
const LABEL_HEIGHT = 176;

/** 다운로드 파일명. 부스 이름은 파일명에 못 쓰는 문자가 섞일 수 있어 코드만 쓴다. */
export function boothQrFilename(code: string): string {
  return `booth-${code}.png`;
}

/** 인쇄용 PNG data URL — QR + 코드 라벨. 브라우저에서만 동작한다(canvas 사용). */
export async function renderBoothQrPng(
  qrUrl: string,
  code: string
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE + LABEL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("QR 이미지를 만들지 못했어요.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // errorCorrectionLevel M — 32자 링크는 버전 3(29×29)에 들어간다.
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR 이미지를 만들지 못했어요."));
    image.src = qrDataUrl;
  });
  ctx.drawImage(image, 0, 0, QR_SIZE, QR_SIZE);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 104px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, QR_SIZE / 2, QR_SIZE + LABEL_HEIGHT / 2);

  return canvas.toDataURL("image/png");
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run test`
Expected: PASS

- [ ] **Step 6: QR 다이얼로그 작성**

`frontend/components/admin/BoothQrDialog.tsx`:

```tsx
"use client";

import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminBooth } from "@/lib/api";
import { boothQrFilename, renderBoothQrPng } from "@/lib/boothQr";

interface BoothQrDialogProps {
  /** null이면 닫힌 상태. */
  booth: AdminBooth | null;
  onOpenChange: (open: boolean) => void;
}

/** 부스 QR 미리보기 + 인쇄용 PNG 다운로드 + 링크 복사. */
export function BoothQrDialog({ booth, onOpenChange }: BoothQrDialogProps) {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!booth) {
      setPngDataUrl(null);
      setError(null);
      setCopied(false);
      return;
    }

    let active = true;
    renderBoothQrPng(booth.qr_url, booth.code)
      .then((dataUrl) => {
        if (active) setPngDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setError("QR 이미지를 만들지 못했어요.");
      });

    return () => {
      active = false;
    };
  }, [booth]);

  function download() {
    if (!booth || !pngDataUrl) return;
    const link = document.createElement("a");
    link.href = pngDataUrl;
    link.download = boothQrFilename(booth.code);
    link.click();
  }

  async function copyLink() {
    if (!booth) return;
    await navigator.clipboard.writeText(booth.qr_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={booth !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{booth?.name} QR</DialogTitle>
        </DialogHeader>

        {booth && (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border bg-white p-4">
              {error ? (
                <p className="py-16 text-sm text-destructive">{error}</p>
              ) : pngDataUrl ? (
                // 다운로드하는 것과 같은 이미지를 그대로 보여준다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pngDataUrl}
                  alt={`${booth.name} 부스 QR (코드 ${booth.code})`}
                  className="size-56 object-contain"
                />
              ) : (
                <Skeleton className="size-56" />
              )}
            </div>

            <p className="break-all text-center font-mono text-xs text-muted-foreground">
              {booth.qr_url}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => void copyLink()}
              >
                <Copy className="size-4" aria-hidden />
                {copied ? "복사됨" : "링크 복사"}
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={!pngDataUrl}
                onClick={download}
              >
                <Download className="size-4" aria-hidden />
                PNG 저장
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: 목록 페이지에 QR 버튼 연결**

`frontend/app/admin/booths/page.tsx`를 세 군데 수정한다.

import에 추가:

```tsx
import { QrCode } from "lucide-react";
import { BoothQrDialog } from "@/components/admin/BoothQrDialog";
```

(`lucide-react` import는 기존 줄에 합친다: `import { Inbox, Pencil, Plus, QrCode, Trash2 } from "lucide-react";`)

상태 추가 (`const [formError, ...]` 아래):

```tsx
  const [qrBooth, setQrBooth] = useState<AdminBooth | null>(null);
```

행의 버튼 묶음에서 "수정" 앞에 QR 버튼을 추가한다:

```tsx
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setQrBooth(booth)}
                        >
                          <QrCode className="size-4" aria-hidden />
                          QR
                        </Button>
```

`<BoothFormDialog ... />` 아래에 다이얼로그를 추가한다:

```tsx
      <BoothQrDialog
        booth={qrBooth}
        onOpenChange={(open) => !open && setQrBooth(null)}
      />
```

- [ ] **Step 8: 린트·빌드 확인**

Run: `npm run lint && npm run test && npm run build`
Expected: 모두 통과.

- [ ] **Step 9: QR 수동 확인**

`npm run dev`로 띄우고 `/admin/booths`에서 확인한다:

1. 행의 "QR" 버튼 → 다이얼로그에 QR과 그 아래 코드 6자가 보인다
2. 다이얼로그 하단 링크가 `http://localhost:3000/b/<코드>` 형태다
   (로컬 백엔드의 `FRONTEND_ORIGIN` 기본값이 그대로 나오는 것이 정상이다)
3. "PNG 저장" → `booth-<코드>.png`가 받아지고, 열어보면 QR 아래 코드가 함께 찍혀 있다
4. 받은 PNG를 화면에 띄우고 **휴대폰 기본 카메라로 스캔** → 링크가 인식된다
   (로컬 주소라 페이지는 안 열려도 된다. QR이 읽히는지만 본다)
5. "링크 복사" → 클립보드에 `qr_url`이 들어간다

- [ ] **Step 10: 커밋**

```bash
git add frontend/lib/boothQr.ts frontend/lib/boothQr.test.ts frontend/components/admin/BoothQrDialog.tsx frontend/app/admin/booths/page.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: 부스 QR 미리보기와 인쇄용 PNG 다운로드 추가"
```

---

## 마무리 체크

- [ ] backend: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest` 전부 통과
- [ ] frontend: `npm run lint && npm run test && npm run build` 전부 통과
- [ ] Supabase에 `0007_create_booths.sql`을 적용했다 (운영 DB 반영은 배포 담당자 확인 후)
- [ ] 서버 `backend/.env`에 `FRONTEND_ORIGIN=https://i-be.vercel.app`를 넣었다 —
      **이걸 빼먹으면 `APP_ENV=production`에서 앱이 기동하지 않는다.** 배포 전에 반드시 먼저 넣는다
- [ ] PR 제목 `feat: 관리자 부스 관리와 부스별 QR 발급`, base는 `production`,
      본문은 `## 개요` + `## 변경 내용`(backend/frontend로 나눠 기재). `backend/**`가 바뀌므로
      머지 시 자동 배포된다는 점을 본문에 명시한다
