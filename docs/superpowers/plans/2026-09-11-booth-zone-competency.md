# 부스 존·역량과 QR 일괄 발급 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부스 67개를 존과 함께 일괄 등록하고 QR을 한 번에 인쇄하며, 학생 성향 차트의 축을 부스에서 NCS 역량 10개로 바꾼다.

**Architecture:** `ops.booths`에 `zone` 컬럼 하나를 더하고, 부스↔역량은 `ops.booth_competencies` 연결 테이블로 둔다. 역량 점수는 저장하지 않고 방문 기록과 부스의 역량을 파이썬에서 세어 프로필 응답에 싣는다. 등록은 관리자 API만 호출하는 CSV 시드 스크립트가 맡고, QR 인쇄는 기존 QR 그리기 함수를 재사용하는 브라우저 인쇄 페이지로 한다.

**Tech Stack:** FastAPI · asyncpg(Postgres/Supabase) · Pydantic v2 · pytest · Next.js 16 · TypeScript · recharts(설치됨) · qrcode(설치됨) · vitest

**Spec:** [`../specs/2026-09-11-booth-zone-competency-design.md`](../specs/2026-09-11-booth-zone-competency-design.md)

## Global Constraints

- 언어: 커밋 메시지·PR·문서·UI 텍스트 모두 한국어. 커밋 메시지는 Conventional Commits 접두사 + 한국어 설명.
- 커밋·PR에 `🤖 Generated with Claude Code` 같은 자동 생성 푸터나 서명을 넣지 않는다.
- 작업 브랜치는 `develop`. `production`에 직접 커밋하지 않는다.
- 백엔드 품질 게이트(변경 시 매번): `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app` · `uv run pytest`. 모두 `backend/`에서 실행한다.
- 프론트 품질 게이트(변경 시 매번): `npm run lint` · `npm run build`. `frontend/`에서 실행한다. vitest는 `npm run test`.
- 백엔드는 mypy `strict` 기준이다. `# type: ignore`를 쓰면 같은 줄이나 위에 사유를 주석으로 남긴다.
- 의존성을 새로 추가하지 않는다. 백엔드는 `uv`, 프론트는 `npm`으로만 관리하며 이 계획에는 추가가 없다.
- 부스 6자 `code`는 발급 후 불변이다. 어떤 API·스크립트도 code를 바꾸지 않는다.
- 역량 키 10개는 정확히 이 값이고 이 순서다(차트 축 순서):
  `communication`, `creativity`, `analysis`, `challenge`, `empathy`, `collaboration`, `thinking`, `judgment`, `self_understanding`, `planning`
- 한글 라벨 10개는 정확히 이 값이다:
  의사소통, 창의성, 분석력, 도전정신, 공감, 협업, 사고력, 판단력, 자기이해, 계획성
- 존 값 4개는 정확히 이 값이다: `F`(직업체험 F존), `L`(직업체험 L존), `Y`(직업체험 Y존), `C`(역량체험존). 존을 모르는 부스는 빈 문자열 `''`.

---

## File Structure

**백엔드 — 생성**

- `backend/supabase/migrations/0013_add_booths_zone.sql` — `ops.booths.zone` 컬럼과 체크 제약.
- `backend/supabase/migrations/0014_create_booth_competencies.sql` — 부스↔역량 연결 테이블.
- `backend/app/core/competencies.py` — 역량 키 10개와 한글 라벨. 단일 출처.
- `backend/scripts/seed_booths.py` — CSV → 관리자 API 일괄 등록/역량 갱신.
- `backend/scripts/booths.csv` — 부스 67개 명단. 역량 칸은 비어 있다.
- `backend/tests/test_competency_score.py` — 역량 점수 집계 단위 테스트.
- `backend/tests/test_seed_booths_script.py` — 시드 스크립트 단위 테스트.

**백엔드 — 수정**

- `backend/app/repositories/booth_repo.py` — `BoothRecord`에 `zone`·`competencies`, 조회 쿼리에 역량 조인, 역량 치환 메서드.
- `backend/app/schemas/booths.py` — 요청·응답 모델에 `zone`·`competencies`.
- `backend/app/services/booth_service.py` — 존·역량 반영.
- `backend/app/schemas/students.py` — `ProfileSummary.competencies`.
- `backend/app/services/session_service.py` — 역량 점수 계산.
- `backend/tests/test_booth_service.py` — FakeBoothRepo에 존·역량 반영.
- `backend/tests/test_booths_router.py` — 존·역량 검증 케이스.

**프론트 — 생성**

- `frontend/lib/competencies.ts` — 역량 키·라벨 상수와 차트 데이터 변환 순수 함수.
- `frontend/lib/competencies.test.ts` — 위 함수의 vitest.
- `frontend/app/admin/booths/print/page.tsx` — QR 일괄 인쇄 페이지.
- `frontend/components/admin/BoothPrintSheet.tsx` — 인쇄용 QR 격자.

**프론트 — 수정**

- `frontend/lib/api.ts` — 부스·프로필 타입에 `zone`·`competencies`.
- `frontend/components/console/BoothListView.tsx` — 존 컬럼·존 필터·인쇄 버튼.
- `frontend/components/admin/BoothFormDialog.tsx` — 존 선택·역량 선택.
- `frontend/app/(tabs)/tendency/page.tsx` — 차트 축을 역량으로 교체.

**문서 — 수정**

- `docs/guides/architecture.md` — 부스 항목과 변경 이력.
- `docs/guides/booths.md` — 시스템 반영 절과 변경 이력.

---

### Task 1: 부스 존 컬럼

**Files:**
- Create: `backend/supabase/migrations/0013_add_booths_zone.sql`
- Modify: `backend/app/repositories/booth_repo.py`
- Modify: `backend/app/schemas/booths.py`
- Modify: `backend/app/services/booth_service.py`
- Test: `backend/tests/test_booth_service.py`, `backend/tests/test_booths_router.py`

**Interfaces:**
- Produces: `BoothRecord.zone: str`, `BoothRepository.create(*, code, name, description, zone)`, `BoothRepository.update(booth_id, *, name, description, zone)`, `BoothCreateRequest.zone: str`, `BoothUpdateRequest.zone: str | None`, `BoothResponse.zone: str`

- [ ] **Step 1: 마이그레이션 파일을 만든다**

`backend/supabase/migrations/0013_add_booths_zone.sql`:

```sql
-- ops.booths — 부스가 속한 존.
--
-- F/L/Y는 직업체험 3개 존, C는 역량체험존이다. 존을 모르는 부스(기존 행 포함)는 ''로 둔다.
-- 존은 4개로 고정이고 이름도 바뀌지 않아 별도 테이블을 두지 않는다. 부스는 존 하나에만
-- 속하므로 연결 테이블도 필요 없다 — 컬럼 하나가 전부다.
-- 인덱스는 두지 않는다. 부스는 행사당 70개 미만이라 순차 조회가 더 싸다.

alter table ops.booths
    add column if not exists zone text not null default '';

alter table ops.booths
    drop constraint if exists booths_zone_valid;

alter table ops.booths
    add constraint booths_zone_valid
    check (zone in ('F', 'L', 'Y', 'C', ''));
```

- [ ] **Step 2: 존을 포함한 생성·수정 테스트를 쓴다 (실패 확인용)**

`backend/tests/test_booth_service.py`의 `FakeBoothRepo`를 먼저 고친다. `create`와 `update` 시그니처에 `zone`을 더하고 `BoothRecord`에 넘긴다.

```python
    async def create(
        self, *, code: str, name: str, description: str | None, zone: str
    ) -> BoothRecord:
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
            zone=zone,
            created_at=now,
            updated_at=now,
        )
        self.rows[record.id] = record
        return record

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None, zone: str
    ) -> BoothRecord | None:
        current = self.rows.get(booth_id)
        if current is None:
            return None
        updated = BoothRecord(
            id=current.id,
            code=current.code,
            name=name,
            description=description,
            zone=zone,
            created_at=current.created_at,
            updated_at=datetime.now(UTC),
        )
        self.rows[booth_id] = updated
        return updated
```

같은 파일 끝에 테스트를 더한다.

```python
@pytest.mark.anyio
async def test_create_with_zone() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(BoothCreateRequest(name="드론 시뮬레이션", zone="F"))

    assert created.zone == "F"


@pytest.mark.anyio
async def test_create_without_zone_is_blank() -> None:
    """기존 관리자 화면은 zone을 보내지 않는다. 그 요청이 그대로 동작해야 한다."""
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(BoothCreateRequest(name="이름만 있는 부스"))

    assert created.zone == ""


@pytest.mark.anyio
async def test_update_keeps_zone_when_not_sent() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(BoothCreateRequest(name="원래 이름", zone="L"))

    updated = await service.update(created.id, BoothUpdateRequest(name="바뀐 이름"))

    assert updated.name == "바뀐 이름"
    assert updated.zone == "L"


def test_invalid_zone_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", zone="Z")
```

파일 상단 import에 `get_settings`가 이미 있는지 확인하고, 없으면 `from app.config import get_settings`를 더한다.

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_booth_service.py -v`
Expected: FAIL — `BoothRecord.__init__() got an unexpected keyword argument 'zone'`

- [ ] **Step 4: BoothRecord와 리포지토리를 고친다**

`backend/app/repositories/booth_repo.py`:

```python
_COLUMNS = "id, code, name, description, zone, created_at, updated_at"


@dataclass(frozen=True, slots=True)
class BoothRecord:
    """ops.booths 한 행."""

    id: UUID
    code: str
    name: str
    description: str | None
    # 'F'·'L'·'Y'·'C' 중 하나, 또는 존을 모르는 부스는 ''.
    zone: str
    created_at: datetime
    updated_at: datetime


def _to_record(row: asyncpg.Record) -> BoothRecord:
    return BoothRecord(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        zone=row["zone"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
```

`create`와 `update`를 고친다.

```python
    async def create(
        self, *, code: str, name: str, description: str | None, zone: str
    ) -> BoothRecord:
        """부스 1건 생성. code가 이미 있으면 asyncpg.UniqueViolationError."""
        query = f"""
            insert into ops.booths (code, name, description, zone)
            values ($1, $2, $3, $4)
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code, name, description, zone)
        assert row is not None  # insert ... returning은 성공 시 항상 1행
        return _to_record(row)

    async def update(
        self, booth_id: UUID, *, name: str, description: str | None, zone: str
    ) -> BoothRecord | None:
        """이름·설명·존을 준 값으로 교체. 없는 id면 None.

        부분 수정(보낸 필드만 반영)은 서비스가 기존 값과 병합해 완성값을 넘기는 방식으로 처리한다.
        여기서 coalesce를 쓰면 description을 null로 지우는 요청과 구분할 수 없다.
        """
        query = f"""
            update ops.booths
               set name        = $2,
                   description = $3,
                   zone        = $4,
                   updated_at  = now()
             where id = $1
            returning {_COLUMNS}
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id, name, description, zone)
        return _to_record(row) if row is not None else None
```

- [ ] **Step 5: 스키마에 zone을 더한다**

`backend/app/schemas/booths.py` 상단에 존 값 목록을 둔다.

```python
# 존 4개 — F/L/Y는 직업체험, C는 역량체험. 존을 모르는 부스는 ''.
BoothZone = Literal["F", "L", "Y", "C", ""]
```

`from typing import Literal`을 import에 더한다. 그리고 세 모델을 고친다.

```python
class BoothCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="부스 이름")
    description: str | None = Field(None, max_length=500, description="부스 설명(선택)")
    zone: BoothZone = Field("", description="F·L·Y·C 중 하나. 생략하면 빈 값")
```

```python
class BoothUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    zone: BoothZone | None = Field(None, description="보내지 않으면 기존 값 유지")
```

```python
class BoothResponse(BaseModel):
    id: UUID
    code: str = Field(..., description="6자 부스 코드 — 발급 후 불변")
    name: str
    description: str | None = None
    zone: BoothZone = ""
    qr_url: str = Field(..., description="QR에 담을 링크 (FRONTEND_ORIGIN 기준)")
    created_at: datetime
```

`BoothUpdateRequest`의 docstring에 한 줄을 더한다: `zone에 null을 명시하면 검증에서 거부된다(빈 값으로 지우려면 ''를 보낸다).` 그리고 zone 검증기를 더한다.

```python
    @field_validator("zone")
    @classmethod
    def _check_zone(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("존은 비울 수 없어요. 지우려면 빈 문자열을 보내주세요.")
        return value
```

- [ ] **Step 6: 서비스가 존을 넘기게 고친다**

`backend/app/services/booth_service.py`의 `_to_response`·`create`·`update`:

```python
    def _to_response(self, record: BoothRecord) -> BoothResponse:
        return BoothResponse(
            id=record.id,
            code=record.code,
            name=record.name,
            description=record.description,
            zone=record.zone,  # type: ignore[arg-type]  # DB text ↔ Literal, 제약이 값을 보장한다
            qr_url=self._qr_url(record.code),
            created_at=record.created_at,
        )
```

`create`의 repo 호출에 `zone=req.zone`을 더하고, `update`에는 병합을 더한다.

```python
        zone = req.zone if "zone" in provided else current.zone
        assert zone is not None  # BoothUpdateRequest 검증기가 명시적 null을 이미 거부한다

        updated = await self._booths.update(
            booth_id, name=name, description=description, zone=zone
        )
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_booth_service.py -v`
Expected: PASS

- [ ] **Step 8: 라우터 테스트를 더한다**

`backend/tests/test_booths_router.py` 끝에:

```python
@pytest.mark.anyio
async def test_create_booth_rejects_unknown_zone() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "부스", "zone": "Z"},
            headers=_auth(),
        )
        assert res.status_code == 422


@pytest.mark.anyio
async def test_create_booth_returns_zone() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "드론 시뮬레이션", "zone": "F"},
            headers=_auth(),
        )
        assert res.status_code == 201
        assert res.json()["zone"] == "F"
```

- [ ] **Step 9: 백엔드 품질 게이트를 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 통과

- [ ] **Step 10: 커밋**

```bash
git add backend/supabase/migrations/0013_add_booths_zone.sql backend/app/repositories/booth_repo.py backend/app/schemas/booths.py backend/app/services/booth_service.py backend/tests/test_booth_service.py backend/tests/test_booths_router.py
git commit -m "feat: 부스에 존(F·L·Y·C) 구분 추가

부스 67개가 한 목록에 평평하게 쌓이면 현장에서 찾지 못한다. 존은 4개로 고정이고
부스는 존 하나에만 속하므로 별도 테이블 없이 컬럼 하나와 체크 제약으로 둔다.
존을 보내지 않는 기존 요청은 빈 값으로 그대로 동작한다."
```

---

### Task 2: 부스-역량 연결

**Files:**
- Create: `backend/supabase/migrations/0014_create_booth_competencies.sql`
- Create: `backend/app/core/competencies.py`
- Modify: `backend/app/repositories/booth_repo.py`
- Modify: `backend/app/schemas/booths.py`
- Modify: `backend/app/services/booth_service.py`
- Test: `backend/tests/test_booth_service.py`, `backend/tests/test_booths_router.py`

**Interfaces:**
- Consumes: Task 1의 `BoothRecord.zone`, `BoothRepository.create(..., zone)`, `BoothRepository.update(..., zone)`
- Produces: `COMPETENCY_KEYS: tuple[str, ...]`(10개, 차트 축 순서), `COMPETENCY_LABELS: dict[str, str]`, `BoothRecord.competencies: tuple[str, ...]`, `BoothRepository.replace_competencies(booth_id, competencies) -> None`, `BoothCreateRequest.competencies: list[str]`, `BoothUpdateRequest.competencies: list[str] | None`, `BoothResponse.competencies: list[str]`

- [ ] **Step 1: 역량 상수 파일을 만든다**

`backend/app/core/competencies.py`:

```python
"""NCS 직업기초능력 10개 역량 — 키와 한글 라벨의 단일 출처.

부스 하나에 역량 여럿이 붙고(직업체험 3개, 역량체험 1개), 학생이 그 부스를 방문하면
연결된 역량이 1점씩 오른다. 이 순서가 학생 성향 탭 레이더 차트의 축 순서다.

역량은 10개로 고정이고 이름도 바뀌지 않아 테이블을 두지 않는다. DB 쪽은
ops.booth_competencies의 체크 제약이 같은 목록을 강제한다 — 값을 고칠 때 둘 다 고쳐야 한다.
"""

from __future__ import annotations

COMPETENCY_LABELS: dict[str, str] = {
    "communication": "의사소통",
    "creativity": "창의성",
    "analysis": "분석력",
    "challenge": "도전정신",
    "empathy": "공감",
    "collaboration": "협업",
    "thinking": "사고력",
    "judgment": "판단력",
    "self_understanding": "자기이해",
    "planning": "계획성",
}

# dict는 삽입 순서를 유지한다 — 이 순서가 차트 축 순서다.
COMPETENCY_KEYS: tuple[str, ...] = tuple(COMPETENCY_LABELS)
```

- [ ] **Step 2: 마이그레이션 파일을 만든다**

`backend/supabase/migrations/0014_create_booth_competencies.sql`:

```sql
-- ops 스키마 — 부스와 NCS 직업기초능력 역량의 연결.
--
-- 부스 하나에 역량 여럿, 역량 하나에 부스 여럿이라 연결 테이블로 둔다.
-- 컬럼 3개로 두면 "이 역량을 다루는 부스" 조회가 3열 OR이 되고 개수가 바뀔 때 스키마가 또 바뀐다.
--
-- "정확히 3개"는 제약으로 걸지 않는다. 역량체험 부스는 1개고, 주최측 매핑 자료가 오기
-- 전에는 0개다. 개수 규칙은 시드 스크립트(scripts/seed_booths.py)가 검사한다.
-- 제약은 언제나 참인 것만 담아야 한다.
--
-- 역방향 인덱스(competency 단독)는 두지 않는다. 부스 70개 × 역량 3개로 200행 미만이다.
-- 역량 목록은 app/core/competencies.py와 같아야 한다 — 값을 고칠 때 둘 다 고친다.

create schema if not exists ops;

create table if not exists ops.booth_competencies (
    booth_id   uuid not null references ops.booths (id) on delete cascade,
    competency text not null check (competency in (
        'communication', 'creativity', 'analysis', 'challenge', 'empathy',
        'collaboration', 'thinking', 'judgment', 'self_understanding', 'planning'
    )),
    primary key (booth_id, competency)
);
```

- [ ] **Step 3: 역량을 포함한 생성·수정 테스트를 쓴다 (실패 확인용)**

`backend/tests/test_booth_service.py`의 `FakeBoothRepo`에 역량 저장소를 더한다.

```python
    def __init__(self, *, collide_times: int = 0) -> None:
        self.rows: dict[UUID, BoothRecord] = {}
        self.collide_times = collide_times
        self.attempted_codes: list[str] = []

    async def replace_competencies(self, booth_id: UUID, competencies: list[str]) -> None:
        current = self.rows.get(booth_id)
        if current is None:
            return
        self.rows[booth_id] = replace(current, competencies=tuple(competencies))
```

`from dataclasses import replace`를 import에 더한다. `create`·`update`는 `competencies=()`를 넘기도록 `BoothRecord` 생성부를 고치고, `update`는 기존 역량을 보존한다(`competencies=current.competencies`).

테스트를 더한다.

```python
@pytest.mark.anyio
async def test_create_with_competencies() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]

    created = await service.create(
        BoothCreateRequest(
            name="드론 시뮬레이션",
            zone="F",
            competencies=["challenge", "analysis", "thinking"],
        )
    )

    assert sorted(created.competencies) == ["analysis", "challenge", "thinking"]


@pytest.mark.anyio
async def test_update_replaces_competencies() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(
        BoothCreateRequest(name="부스", zone="F", competencies=["challenge"])
    )

    updated = await service.update(
        created.id, BoothUpdateRequest(competencies=["empathy", "planning"])
    )

    assert sorted(updated.competencies) == ["empathy", "planning"]


@pytest.mark.anyio
async def test_update_keeps_competencies_when_not_sent() -> None:
    repo = FakeBoothRepo()
    service = BoothService(booths=repo, settings=get_settings())  # type: ignore[arg-type]
    created = await service.create(
        BoothCreateRequest(name="부스", zone="F", competencies=["challenge"])
    )

    updated = await service.update(created.id, BoothUpdateRequest(name="바뀐 이름"))

    assert updated.competencies == ["challenge"]


def test_unknown_competency_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", competencies=["없는역량"])


def test_duplicate_competency_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BoothCreateRequest(name="부스", competencies=["challenge", "challenge"])
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_booth_service.py -v`
Expected: FAIL — `BoothCreateRequest`에 `competencies` 필드가 없다

- [ ] **Step 5: 리포지토리에 역량 조회·치환을 더한다**

`backend/app/repositories/booth_repo.py`. `BoothRecord`에 필드를 더한다.

```python
    # 이 부스에 연결된 역량 키. 매핑 자료가 오기 전에는 빈 튜플이다.
    competencies: tuple[str, ...] = ()
```

조회 쿼리를 역량까지 함께 가져오도록 바꾼다. `_COLUMNS`는 그대로 두고 조인용 select를 따로 만든다.

```python
# 부스 1행 + 연결된 역량 배열. left join이라 역량이 없는 부스도 빈 배열로 나온다.
_SELECT_WITH_COMPETENCIES = f"""
    select {", ".join("b." + c.strip() for c in _COLUMNS.split(","))},
           coalesce(
               array_agg(bc.competency order by bc.competency)
                   filter (where bc.competency is not null),
               '{{}}'
           ) as competencies
      from ops.booths b
      left join ops.booth_competencies bc on bc.booth_id = b.id
"""
```

`_to_record`가 역량을 읽게 고친다.

```python
def _to_record(row: asyncpg.Record) -> BoothRecord:
    # insert/update의 returning에는 competencies가 없다 — 그때는 빈 튜플로 둔다.
    raw = row["competencies"] if "competencies" in row.keys() else ()
    return BoothRecord(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        zone=row["zone"],
        competencies=tuple(raw),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
```

`get`·`get_by_code`·`list_all`을 조인 쿼리로 바꾼다.

```python
    async def get(self, booth_id: UUID) -> BoothRecord | None:
        query = f"{_SELECT_WITH_COMPETENCIES} where b.id = $1 group by b.id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, booth_id)
        return _to_record(row) if row is not None else None

    async def get_by_code(self, code: str) -> BoothRecord | None:
        """QR/수동 입력으로 들어온 code로 부스를 찾는다. 없으면 None.

        code 정규화(대문자·공백 제거)는 호출부(BoothVisitService)의 책임이다.
        """
        query = f"{_SELECT_WITH_COMPETENCIES} where b.code = $1 group by b.id"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, code)
        return _to_record(row) if row is not None else None

    async def list_all(self) -> list[BoothRecord]:
        """전체 부스 — 등록 순. 부스는 행사당 수십 개라 페이지네이션을 두지 않는다."""
        query = f"{_SELECT_WITH_COMPETENCIES} group by b.id order by b.created_at"
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [_to_record(row) for row in rows]
```

역량 치환 메서드를 더한다.

```python
    async def replace_competencies(self, booth_id: UUID, competencies: list[str]) -> None:
        """이 부스의 역량을 준 목록으로 통째로 바꾼다.

        지우고 다시 넣는다. 최대 3행이라 차이를 계산하는 것보다 싸고, 중간 상태가 없다.
        한 트랜잭션에서 처리해 삭제만 되고 삽입이 실패하는 일이 없게 한다.
        """
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("delete from ops.booth_competencies where booth_id = $1", booth_id)
            if competencies:
                await conn.executemany(
                    "insert into ops.booth_competencies (booth_id, competency) values ($1, $2)",
                    [(booth_id, c) for c in competencies],
                )
```

- [ ] **Step 6: 스키마에 competencies를 더한다**

`backend/app/schemas/booths.py`. import에 `from app.core.competencies import COMPETENCY_KEYS`를 더하고 검증 함수를 둔다.

```python
def _check_competencies(value: list[str]) -> list[str]:
    """역량 키가 알려진 값인지, 중복이 없는지 본다.

    개수(직업체험 3개·역량체험 1개)는 여기서 강제하지 않는다. 매핑 자료가 오기 전에는
    0개로 두어야 하고, 개수 규칙은 시드 스크립트가 검사한다.
    """
    unknown = [c for c in value if c not in COMPETENCY_KEYS]
    if unknown:
        raise ValueError(f"알 수 없는 역량이에요: {', '.join(unknown)}")
    if len(set(value)) != len(value):
        raise ValueError("같은 역량을 두 번 넣을 수 없어요.")
    return value
```

세 모델에 필드와 검증기를 더한다.

```python
    competencies: list[str] = Field(
        default_factory=list, max_length=10, description="연결할 역량 키 목록"
    )

    @field_validator("competencies")
    @classmethod
    def _check_competency_list(cls, value: list[str]) -> list[str]:
        return _check_competencies(value)
```

`BoothUpdateRequest`는 `list[str] | None = None`으로 두고, 검증기에서 `None`이면 그대로 돌려준다. `BoothResponse`는 `competencies: list[str] = Field(default_factory=list)`만 더한다(검증기 없음).

- [ ] **Step 7: 서비스가 역량을 반영하게 고친다**

`backend/app/services/booth_service.py`. `_to_response`에 `competencies=list(record.competencies)`를 더한다.

`create`는 부스를 만든 뒤 역량을 넣고 다시 읽는다.

```python
    async def create(self, req: BoothCreateRequest) -> BoothResponse:
        """부스 생성 — 코드를 발급하고, 충돌하면 새 코드로 재시도한다."""
        for _ in range(_CODE_MAX_ATTEMPTS):
            try:
                record = await self._booths.create(
                    code=generate_booth_code(),
                    name=req.name,
                    description=req.description,
                    zone=req.zone,
                )
            except asyncpg.UniqueViolationError:
                continue
            # 빈 목록이면 건너뛴다 — 새 부스에는 지울 역량이 없어 재조회가 낭비다.
            return await self._apply_competencies(record, req.competencies or None)
        raise ConflictError("부스 코드를 발급하지 못했습니다. 다시 시도해주세요.")

    async def _apply_competencies(
        self, record: BoothRecord, competencies: list[str] | None
    ) -> BoothResponse:
        """역량을 넣고 최신 상태로 응답을 만든다.

        insert/update의 returning에는 역량이 없어(조인 쿼리가 아니다) 넣은 뒤 다시 읽는다.
        보내지 않았으면(None) 건드리지 않는다.
        """
        if competencies is None:
            return self._to_response(record)
        await self._booths.replace_competencies(record.id, competencies)
        refreshed = await self._booths.get(record.id)
        return self._to_response(refreshed if refreshed is not None else record)
```

`update`는 병합 뒤 같은 헬퍼를 쓴다.

```python
        competencies = req.competencies if "competencies" in provided else None

        updated = await self._booths.update(
            booth_id, name=name, description=description, zone=zone
        )
        if updated is None:
            raise NotFoundError("부스를 찾을 수 없습니다.")
        return await self._apply_competencies(updated, competencies)
```

`from app.repositories.booth_repo import BoothRecord, BoothRepository`로 import를 맞춘다.

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_booth_service.py -v`
Expected: PASS

- [ ] **Step 9: 라우터 테스트를 더한다**

`backend/tests/test_booths_router.py` 끝에:

```python
@pytest.mark.anyio
async def test_create_booth_rejects_unknown_competency() -> None:
    app, _repo = _build()
    async for client in _client(app):
        res = await client.post(
            "/api/admin/booths",
            json={"name": "부스", "competencies": ["없는역량"]},
            headers=_auth(),
        )
        assert res.status_code == 422
```

- [ ] **Step 10: 백엔드 품질 게이트를 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 통과

- [ ] **Step 11: 커밋**

```bash
git add backend/supabase/migrations/0014_create_booth_competencies.sql backend/app/core/competencies.py backend/app/repositories/booth_repo.py backend/app/schemas/booths.py backend/app/services/booth_service.py backend/tests/test_booth_service.py backend/tests/test_booths_router.py
git commit -m "feat: 부스와 NCS 역량 10개를 연결

부스 하나에 역량 여럿, 역량 하나에 부스 여럿이라 연결 테이블로 둔다. 역량 10개는
고정이라 테이블 대신 체크 제약과 코드 상수로 두고, 두 목록이 같아야 한다.
'정확히 3개'는 제약으로 걸지 않는다 — 역량체험 부스는 1개고 매핑 자료가 오기 전에는
0개다. 개수 검사는 시드 스크립트가 맡는다."
```

---

### Task 3: 학생 프로필 역량 점수

**Files:**
- Modify: `backend/app/schemas/students.py`
- Modify: `backend/app/services/session_service.py`
- Test: `backend/tests/test_competency_score.py` (create)

**Interfaces:**
- Consumes: Task 2의 `COMPETENCY_KEYS`·`COMPETENCY_LABELS`, `BoothRecord.competencies`
- Produces: `ProfileCompetencyScore(key: str, label: str, score: int)`, `ProfileSummary.competencies: list[ProfileCompetencyScore]` — 항상 10개, `COMPETENCY_KEYS` 순서

- [ ] **Step 1: 점수 집계 테스트를 쓴다**

`backend/tests/test_competency_score.py` (새 파일):

```python
"""역량 점수 집계 — 방문한 부스의 역량을 1점씩 더한다."""

from __future__ import annotations

from uuid import uuid4

from app.core.competencies import COMPETENCY_KEYS
from app.services.session_service import compute_competency_scores


def test_no_visits_gives_all_zero() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())

    assert len(scores) == len(COMPETENCY_KEYS)
    assert [s.score for s in scores] == [0] * len(COMPETENCY_KEYS)


def test_axis_order_follows_competency_keys() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())

    assert [s.key for s in scores] == list(COMPETENCY_KEYS)


def test_visited_booth_raises_its_competencies() -> None:
    booth = uuid4()
    scores = compute_competency_scores(
        booth_competencies={booth: ("challenge", "analysis", "thinking")},
        visited_booth_ids={booth},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 1
    assert by_key["analysis"] == 1
    assert by_key["thinking"] == 1
    assert by_key["empathy"] == 0


def test_overlapping_competency_accumulates() -> None:
    first, second = uuid4(), uuid4()
    scores = compute_competency_scores(
        booth_competencies={first: ("challenge", "empathy"), second: ("challenge",)},
        visited_booth_ids={first, second},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 2
    assert by_key["empathy"] == 1


def test_unvisited_booth_does_not_count() -> None:
    visited, skipped = uuid4(), uuid4()
    scores = compute_competency_scores(
        booth_competencies={visited: ("challenge",), skipped: ("empathy",)},
        visited_booth_ids={visited},
    )
    by_key = {s.key: s.score for s in scores}

    assert by_key["challenge"] == 1
    assert by_key["empathy"] == 0


def test_labels_are_korean() -> None:
    scores = compute_competency_scores(booth_competencies={}, visited_booth_ids=set())
    by_key = {s.key: s.label for s in scores}

    assert by_key["communication"] == "의사소통"
    assert by_key["self_understanding"] == "자기이해"
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_competency_score.py -v`
Expected: FAIL — `cannot import name 'compute_competency_scores'`

- [ ] **Step 3: 응답 모델을 더한다**

`backend/app/schemas/students.py`의 `ProfileBoothStatus` 아래에:

```python
class ProfileCompetencyScore(BaseModel):
    """역량 1개의 점수 — 성향 탭 레이더 차트의 축 하나.

    점수가 0인 역량도 빠뜨리지 않고 10개를 모두 내려준다. 프론트가 빠진 축을 메우는
    코드를 갖지 않게 하기 위함이다.
    """

    key: str = Field(..., description="역량 키 (app/core/competencies.py)")
    label: str = Field(..., description="화면에 쓰는 한글 이름")
    score: int = Field(..., ge=0, description="이 역량을 다루는 부스를 방문한 횟수")
```

`ProfileSummary`에 필드와 docstring 한 줄을 더한다.

```python
    competencies: list[ProfileCompetencyScore] = Field(default_factory=list)
```

docstring에: `competencies: 역량 10개의 점수. 방문 기록이 없어도 0점으로 10개를 채운다.`

- [ ] **Step 4: 점수 계산 함수를 만든다**

`backend/app/services/session_service.py`에 모듈 수준 함수를 둔다(클래스 밖, import 아래).

```python
def compute_competency_scores(
    *,
    booth_competencies: dict[UUID, tuple[str, ...]],
    visited_booth_ids: set[UUID],
) -> list[ProfileCompetencyScore]:
    """방문한 부스의 역량을 1점씩 더해 10개 축을 만든다.

    점수를 저장하지 않고 조회할 때마다 센다. 매핑이 나중에 바뀌어도 재계산이 필요 없고,
    학생 1명당 최대 부스 수만큼만 도는 계산이라 비용이 문제되지 않는다.

    클래스 밖에 두는 이유는 테스트다 — DB도 서비스 조립도 없이 부를 수 있다.
    """
    counts = dict.fromkeys(COMPETENCY_KEYS, 0)
    for booth_id in visited_booth_ids:
        for competency in booth_competencies.get(booth_id, ()):
            # 알 수 없는 값은 건너뛴다. 역량 목록에서 항목을 뺐는데 DB에 남아 있는 경우.
            if competency in counts:
                counts[competency] += 1
    return [
        ProfileCompetencyScore(key=key, label=COMPETENCY_LABELS[key], score=counts[key])
        for key in COMPETENCY_KEYS
    ]
```

import에 다음을 더한다.

```python
from app.core.competencies import COMPETENCY_KEYS, COMPETENCY_LABELS
```

그리고 `app.schemas.students` import 목록에 `ProfileCompetencyScore`를 더한다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_competency_score.py -v`
Expected: PASS

- [ ] **Step 6: 프로필 응답에 점수를 싣는다**

`backend/app/services/session_service.py`의 `_list_booth_statuses`를 부스 목록과 방문을 함께 돌려주도록 바꾸고, 역량 점수도 만든다.

```python
    async def _list_booth_statuses(
        self, student_id: UUID
    ) -> tuple[list[ProfileBoothStatus], list[ProfileCompetencyScore]]:
        """전체 부스에 방문 여부를 표시하고, 방문한 부스의 역량을 세어 함께 반환한다.

        부스는 행사당 수십 개 수준이라 조인 없이 두 번 조회 후 파이썬에서 합친다.
        """
        all_booths = await self._booths.list_all()
        visits = await self._visits.list_for_student(student_id)
        visited_ids = {v.booth_id for v in visits}
        statuses = [
            ProfileBoothStatus(id=booth.id, name=booth.name, visited=booth.id in visited_ids)
            for booth in all_booths
        ]
        scores = compute_competency_scores(
            booth_competencies={b.id: b.competencies for b in all_booths},
            visited_booth_ids=visited_ids,
        )
        return statuses, scores
```

`get_profile_summary`의 호출부를 고친다.

```python
        booths, competencies = await self._list_booth_statuses(student_id)
```

그리고 `ProfileSummary(...)`를 만드는 세 곳 모두에 `competencies=competencies`를 더한다.

- [ ] **Step 7: 백엔드 품질 게이트를 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 통과. `get_profile_summary`를 쓰는 기존 테스트가 깨지면 `competencies` 기본값이 빠진 곳이 있다는 뜻이다.

- [ ] **Step 8: 커밋**

```bash
git add backend/app/schemas/students.py backend/app/services/session_service.py backend/tests/test_competency_score.py
git commit -m "feat: 학생 프로필에 역량 10개 점수 추가

방문한 부스에 연결된 역량을 1점씩 더해 내려준다. 점수가 0인 역량도 10개를 모두 채워
프론트가 빠진 축을 메우지 않게 한다.

점수는 저장하지 않고 조회할 때 센다. 매핑이 나중에 오고 온 뒤에도 고쳐질 수 있는데,
저장했다면 고칠 때마다 전교생 점수를 재계산해야 한다."
```

---

### Task 4: CSV 시드 스크립트

**Files:**
- Create: `backend/scripts/seed_booths.py`
- Create: `backend/scripts/booths.csv`
- Test: `backend/tests/test_seed_booths_script.py`

**Interfaces:**
- Consumes: Task 1·2의 관리자 API(`POST /api/admin/booths`에 `zone`·`competencies`, `PATCH /api/admin/booths/{id}`에 `competencies`), `COMPETENCY_KEYS`
- Produces: `BoothRow(zone, name, description, competencies)`, `read_rows(path) -> list[BoothRow]`, `run(args, *, transport=None) -> int`

- [ ] **Step 1: 명단 CSV를 문서에서 뽑는다**

부스 67개를 손으로 옮겨 적지 않는다. `docs/guides/booths.md`의 표를 변환한다.
아래 스크립트를 `/tmp/md2csv.py`에 저장하고 저장소 루트에서 실행한다.

```python
"""docs/guides/booths.md의 부스 표를 시드용 CSV로 바꾼다. 한 번 쓰고 버리는 변환기."""

import csv
import re
import sys
from pathlib import Path

ZONE_BY_HEADING = {"F(Future)존": "F", "L(Love)존": "L", "Y(Yourself)존": "Y", "역량체험부스": "C"}

rows = []
zone = None
for line in Path("docs/guides/booths.md").read_text(encoding="utf-8").splitlines():
    if line.startswith("## "):
        zone = next((z for k, z in ZONE_BY_HEADING.items() if k in line), None)
        continue
    if zone is None or not re.match(r"^\| ", line):
        continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) != 3 or cells[0] in ("순", "핵심 역량") or set(cells[0]) <= set("-: "):
        continue
    if zone == "C":
        name, description = cells[1], cells[2]  # 부스명(안), 미션 활동
    else:
        name, description = cells[2], cells[1]  # 체험주제, 기관명
    rows.append({"zone": zone, "name": name, "description": description, "competencies": ""})

writer = csv.DictWriter(sys.stdout, fieldnames=["zone", "name", "description", "competencies"])
writer.writeheader()
writer.writerows(rows)
```

Run: `python3 /tmp/md2csv.py > backend/scripts/booths.csv`

- [ ] **Step 1b: 뽑힌 CSV가 맞는지 센다**

Run: `tail -n +2 backend/scripts/booths.csv | cut -d, -f1 | sort | uniq -c`
Expected: `10 C` · `19 F` · `23 L` · `15 Y` — 합계 67

숫자가 다르면 `docs/guides/booths.md`의 표가 바뀐 것이다. 문서를 먼저 확인한다.

앞 세 줄이 이렇게 나와야 한다.

```csv
F,드론 시뮬레이션,건양대 무유인항공공학과,
F,내 심장의 정보와 건강관리 인공지능,건양대 의료IT공학과,
F,가상현실(VR)로 떠나는 세계여행,국제메타미디어콘텐츠협동조합,
```

C존은 이름이 부스명, 설명이 미션 활동이다.

```csv
C,스피치ON,핵심을 전달하라,
C,창의ON,새로운 쓰임을 찾아라,
```

역량 칸(마지막)은 전부 비어 있다. 주최측 매핑 자료가 오면 이 칸을 채운다.

변환기는 저장소에 커밋하지 않는다. 한 번 쓰고 버린다 — 결과물인 CSV가 원본이 된다.

- [ ] **Step 2: 스크립트 테스트를 쓴다**

`backend/tests/test_seed_booths_script.py` (새 파일):

```python
"""seed_booths 스크립트 — 가짜 transport로 HTTP 없이 검증한다."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from scripts.seed_booths import BoothRow, check_competencies, read_rows


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "booths.csv"
    path.write_text(body, encoding="utf-8")
    return path


def test_read_rows_parses_empty_competencies(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\nF,드론 시뮬레이션,건양대 무유인항공공학과,\n",
    )

    rows = read_rows(path)

    assert rows == [
        BoothRow(
            zone="F",
            name="드론 시뮬레이션",
            description="건양대 무유인항공공학과",
            competencies=[],
        )
    ]


def test_read_rows_splits_competencies_on_semicolon(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\n"
        "F,부스,기관,challenge;analysis;thinking\n",
    )

    rows = read_rows(path)

    assert rows[0].competencies == ["challenge", "analysis", "thinking"]


def test_check_competencies_allows_empty() -> None:
    """매핑 자료가 오기 전에는 전부 비어 있다 — 이게 정상이다."""
    rows = [BoothRow(zone="F", name="부스", description="기관", competencies=[])]

    assert check_competencies(rows) == []


def test_check_competencies_requires_three_for_job_zones() -> None:
    rows = [BoothRow(zone="F", name="부스", description="기관", competencies=["challenge"])]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "3개" in problems[0]


def test_check_competencies_requires_one_for_c_zone() -> None:
    rows = [
        BoothRow(
            zone="C", name="스피치ON", description="핵심을 전달하라",
            competencies=["communication", "empathy"],
        )
    ]

    problems = check_competencies(rows)

    assert len(problems) == 1
    assert "1개" in problems[0]


def test_check_competencies_rejects_unknown_key() -> None:
    rows = [
        BoothRow(
            zone="F", name="부스", description="기관",
            competencies=["challenge", "analysis", "없는역량"],
        )
    ]

    problems = check_competencies(rows)

    assert any("없는역량" in p for p in problems)
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_seed_booths_script.py -v`
Expected: FAIL — `No module named 'scripts.seed_booths'`

- [ ] **Step 4: 스크립트를 만든다**

`backend/scripts/seed_booths.py`:

```python
"""부스 명단 CSV를 관리자 API로 일괄 등록한다.

서버 코드에 의존하지 않고 HTTP만 쓴다. DB에 직접 붙지 않는 이유는 6자 코드 발급이다 —
코드는 혼동 문자를 뺀 랜덤 값이고 충돌 시 재시도까지 서버가 처리한다. SQL로 값을 박으면
그 로직을 우회하게 되고, 인쇄물과 DB가 어긋날 여지가 생긴다.

Usage:
  uv run python -m scripts.seed_booths \\
      --base-url https://api.cnu-likelion.kr \\
      --username admin --password '<비밀번호>' \\
      --csv scripts/booths.csv

옵션:
  --dry-run  무엇이 등록·갱신될지만 출력하고 아무것도 바꾸지 않는다

CSV 형식(헤더 필수): zone,name,description,competencies
  zone          F·L·Y·C 중 하나
  name          부스 이름 — 직업체험은 체험주제, 역량체험은 부스명
  description   직업체험은 기관명, 역량체험은 미션 활동
  competencies  역량 키를 ;로 이어 쓴다. 주최측 매핑 자료가 오기 전에는 비워 둔다

이미 등록된 부스는 **이름으로** 판별해 건너뛴다(체험주제 57개는 서로 모두 다르다).
건너뛴 부스도 역량 칸이 채워져 있으면 역량만 갱신한다 — 자료가 왔을 때 CSV의 역량 칸을
채워 다시 돌리면 끝나게 하기 위함이다. 이름·설명·존은 갱신하지 않는다(관리자 화면에서 고친다).
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

# app.core.competencies와 같은 목록이다. 스크립트는 서버 코드에 의존하지 않으므로 복사해 둔다.
COMPETENCY_KEYS = (
    "communication",
    "creativity",
    "analysis",
    "challenge",
    "empathy",
    "collaboration",
    "thinking",
    "judgment",
    "self_understanding",
    "planning",
)

# 직업체험 부스는 역량 3개, 역량체험 부스는 1개.
_REQUIRED_COUNT = {"F": 3, "L": 3, "Y": 3, "C": 1}


@dataclass(frozen=True, slots=True)
class BoothRow:
    """CSV 한 줄."""

    zone: str
    name: str
    description: str
    competencies: list[str] = field(default_factory=list)


def read_rows(path: Path) -> list[BoothRow]:
    """CSV를 읽는다. 앞뒤 공백은 떼고, 역량은 ;로 나눈다."""
    with path.open(encoding="utf-8", newline="") as fp:
        rows = []
        for raw in csv.DictReader(fp):
            competencies = [c.strip() for c in (raw.get("competencies") or "").split(";")]
            rows.append(
                BoothRow(
                    zone=(raw.get("zone") or "").strip(),
                    name=(raw.get("name") or "").strip(),
                    description=(raw.get("description") or "").strip(),
                    competencies=[c for c in competencies if c],
                )
            )
    return rows


def check_competencies(rows: list[BoothRow]) -> list[str]:
    """역량 칸을 검사해 문제를 문자열 목록으로 돌려준다. 비어 있으면 통과다.

    비어 있는 것을 통과시키는 이유: 주최측 매핑 자료가 오기 전 상태가 그렇다.
    한 줄이라도 채워져 있으면 그 줄은 개수와 키를 모두 만족해야 한다.
    """
    problems = []
    for index, row in enumerate(rows, start=2):  # 2 = 헤더 다음 줄
        if not row.competencies:
            continue
        unknown = [c for c in row.competencies if c not in COMPETENCY_KEYS]
        if unknown:
            problems.append(f"{index}행 '{row.name}': 알 수 없는 역량 {', '.join(unknown)}")
        required = _REQUIRED_COUNT.get(row.zone)
        if required is not None and len(row.competencies) != required:
            problems.append(
                f"{index}행 '{row.name}': {row.zone}존은 역량 {required}개여야 하는데 "
                f"{len(row.competencies)}개다"
            )
    return problems


class AdminClient:
    """관리자 API 클라이언트 — 로그인 토큰을 보관하고 요청에 실어 보낸다."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,  # 테스트에서 가짜 전송 주입용
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout, transport=transport
        )
        self._token: str | None = None

    def login(self, username: str, password: str) -> None:
        res = self._http.post(
            "/api/admin/login", json={"username": username, "password": password}
        )
        res.raise_for_status()
        # 응답 키는 admin_token이다(app/schemas/admin.py AdminLoginResponse).
        self._token = str(res.json()["admin_token"])

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def booths(self) -> list[dict[str, Any]]:
        res = self._http.get("/api/admin/booths", headers=self._headers())
        res.raise_for_status()
        return list(res.json())

    def create(self, row: BoothRow) -> dict[str, Any]:
        res = self._http.post(
            "/api/admin/booths",
            headers=self._headers(),
            json={
                "name": row.name,
                "description": row.description or None,
                "zone": row.zone,
                "competencies": row.competencies,
            },
        )
        res.raise_for_status()
        return dict(res.json())

    def set_competencies(self, booth_id: str, competencies: list[str]) -> None:
        res = self._http.patch(
            f"/api/admin/booths/{booth_id}",
            headers=self._headers(),
            json={"competencies": competencies},
        )
        res.raise_for_status()

    def close(self) -> None:
        self._http.close()


def run(args: argparse.Namespace, *, transport: httpx.BaseTransport | None = None) -> int:
    rows = read_rows(Path(args.csv))
    if not rows:
        print("CSV에 부스가 없다.", file=sys.stderr)
        return 1

    problems = check_competencies(rows)
    if problems:
        print("역량 칸에 문제가 있다. 고치고 다시 돌려라:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    client = AdminClient(args.base_url, transport=transport)
    try:
        client.login(args.username, args.password)
        existing = {str(b["name"]): b for b in client.booths()}

        created = updated = skipped = 0
        for row in rows:
            found = existing.get(row.name)
            if found is None:
                if args.dry_run:
                    print(f"[등록 예정] {row.zone} {row.name}")
                else:
                    made = client.create(row)
                    print(f"[등록] {row.zone} {row.name} → {made['code']}")
                created += 1
                continue

            if row.competencies and list(found.get("competencies") or []) != row.competencies:
                if args.dry_run:
                    print(f"[역량 갱신 예정] {row.name} → {', '.join(row.competencies)}")
                else:
                    client.set_competencies(str(found["id"]), row.competencies)
                    print(f"[역량 갱신] {row.name} → {', '.join(row.competencies)}")
                updated += 1
                continue

            skipped += 1

        prefix = "(dry-run) " if args.dry_run else ""
        print(f"\n{prefix}등록 {created}건 · 역량 갱신 {updated}건 · 건너뜀 {skipped}건")
        return 0
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = " (아이디/비밀번호 확인)" if status == 401 else ""
        print(f"요청 실패 {status}{hint}: {exc.response.text[:200]}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="부스 명단 CSV를 관리자 API로 일괄 등록")
    parser.add_argument("--base-url", default="https://api.cnu-likelion.kr")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--csv", default="scripts/booths.csv")
    parser.add_argument(
        "--dry-run", action="store_true", help="무엇이 바뀔지만 출력하고 바꾸지 않는다"
    )
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
```

관리자 로그인 경로는 `/api/admin/login`, 응답의 토큰 키는 `admin_token`이다. `app/schemas/admin.py`의 `AdminLoginResponse`와 `scripts/export_students.py`에서 확인한 값이다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_seed_booths_script.py -v`
Expected: PASS

- [ ] **Step 6: 등록/건너뛰기 동작 테스트를 더한다**

같은 테스트 파일 끝에:

```python
def _fake_transport(state: dict[str, Any]) -> httpx.MockTransport:
    """관리자 API 대역. 등록 요청을 state["created"]에 모은다."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/admin/login":
            return httpx.Response(200, json={"admin_token": "t"})
        if request.url.path == "/api/admin/booths" and request.method == "GET":
            return httpx.Response(200, json=state["existing"])
        if request.url.path == "/api/admin/booths" and request.method == "POST":
            body = json.loads(request.content)
            state["created"].append(body)
            return httpx.Response(201, json={**body, "id": "new-id", "code": "ABC234"})
        if request.method == "PATCH":
            state["patched"].append(json.loads(request.content))
            return httpx.Response(200, json={"id": "x"})
        raise AssertionError(f"예상하지 못한 요청: {request.method} {request.url}")

    return httpx.MockTransport(handler)


def _args(csv_path: Path, *, dry_run: bool = False) -> argparse.Namespace:
    return argparse.Namespace(
        base_url="http://test",
        username="admin",
        password="pw",
        csv=str(csv_path),
        dry_run=dry_run,
    )


def test_run_creates_missing_booths(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert len(state["created"]) == 1
    assert state["created"][0]["name"] == "드론 시뮬레이션"
    assert state["created"][0]["zone"] == "F"


def test_run_skips_existing_booth_by_name(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {
        "existing": [{"id": "old", "name": "드론 시뮬레이션", "competencies": []}],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []


def test_run_updates_competencies_of_existing_booth(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "zone,name,description,competencies\n"
        "F,드론 시뮬레이션,건양대,challenge;analysis;thinking\n",
    )
    state: dict[str, Any] = {
        "existing": [{"id": "old", "name": "드론 시뮬레이션", "competencies": []}],
        "created": [],
        "patched": [],
    }

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 0
    assert state["patched"] == [{"competencies": ["challenge", "analysis", "thinking"]}]


def test_dry_run_changes_nothing(tmp_path: Path) -> None:
    path = _write(tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,\n")
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path, dry_run=True), transport=_fake_transport(state))

    assert code == 0
    assert state["created"] == []


def test_bad_competency_count_stops_before_any_request(tmp_path: Path) -> None:
    path = _write(
        tmp_path, "zone,name,description,competencies\nF,드론 시뮬레이션,건양대,challenge\n"
    )
    state: dict[str, Any] = {"existing": [], "created": [], "patched": []}

    code = run(_args(path), transport=_fake_transport(state))

    assert code == 1
    assert state["created"] == []
```

import에 `import argparse`와 `from scripts.seed_booths import run`을 더한다.

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `cd backend && uv run pytest tests/test_seed_booths_script.py -v`
Expected: PASS

- [ ] **Step 8: CSV를 dry-run으로 검증한다**

로컬 백엔드를 띄운 상태에서:

Run: `cd backend && uv run python -m scripts.seed_booths --base-url http://localhost:8000 --username admin --password '<로컬 비밀번호>' --csv scripts/booths.csv --dry-run`
Expected: `등록 예정` 67줄과 `(dry-run) 등록 67건 · 역량 갱신 0건 · 건너뜀 0건`

67이 아니면 CSV 행 수를 확인한다.

- [ ] **Step 9: 백엔드 품질 게이트를 돌린다**

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 통과

- [ ] **Step 10: 커밋**

```bash
git add backend/scripts/seed_booths.py backend/scripts/booths.csv backend/tests/test_seed_booths_script.py
git commit -m "feat: 부스 명단 CSV 일괄 등록 스크립트

67개를 관리자 화면에서 하나씩 만들 수 없다. 관리자 API만 호출하는 스크립트로 넣는다 —
DB에 직접 붙으면 6자 코드 발급 로직을 우회해 인쇄물과 어긋날 수 있다.

이미 등록된 부스는 이름으로 판별해 건너뛴다. 중간에 실패해도 다시 돌리면 빠진 것만
들어간다. 역량 칸은 지금 비어 있고, 주최측 자료가 오면 그 칸만 채워 다시 돌리면 된다."
```

---

### Task 5: 관리자 화면 존·역량과 존별 참여 현황

**Files:**
- Modify: `backend/app/repositories/booth_visit_repo.py`
- Modify: `backend/app/schemas/booths.py`
- Modify: `backend/app/services/booth_visit_service.py`
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/competencies.ts`
- Modify: `frontend/components/admin/BoothFormDialog.tsx`
- Modify: `frontend/components/console/BoothListView.tsx`
- Modify: `frontend/components/console/BoothStatsView.tsx`

**Interfaces:**
- Consumes: Task 1·2의 `BoothResponse.zone`·`BoothResponse.competencies`, `BoothRecord.zone`
- Produces: `BoothZone` 타입, `ZONE_LABELS: Record<BoothZone, string>`, `COMPETENCIES: { key: string; label: string }[]`, `AdminBooth.zone`·`AdminBooth.competencies`, `AdminBoothCreatePayload.zone`·`.competencies`, `BoothVisitCountRow.zone`, `BoothVisitStat.zone`

- [ ] **Step 1: 역량·존 상수 파일을 만든다**

`frontend/lib/competencies.ts`:

```ts
// NCS 직업기초능력 10개 역량 — 키와 한글 라벨.
// 백엔드 app/core/competencies.py와 같은 목록이고 같은 순서다. 이 순서가 레이더 차트 축 순서다.
export const COMPETENCIES = [
  { key: "communication", label: "의사소통" },
  { key: "creativity", label: "창의성" },
  { key: "analysis", label: "분석력" },
  { key: "challenge", label: "도전정신" },
  { key: "empathy", label: "공감" },
  { key: "collaboration", label: "협업" },
  { key: "thinking", label: "사고력" },
  { key: "judgment", label: "판단력" },
  { key: "self_understanding", label: "자기이해" },
  { key: "planning", label: "계획성" },
] as const;

// 부스가 속한 존. ''는 존을 모르는 부스(기존 등록분).
export type BoothZone = "F" | "L" | "Y" | "C" | "";

export const ZONE_LABELS: Record<BoothZone, string> = {
  F: "F(Future)존",
  L: "L(Love)존",
  Y: "Y(Yourself)존",
  C: "역량체험존",
  "": "미지정",
};

// 직업체험 부스는 역량 3개, 역량체험 부스는 1개.
export const REQUIRED_COMPETENCY_COUNT: Record<BoothZone, number | null> = {
  F: 3,
  L: 3,
  Y: 3,
  C: 1,
  "": null,
};
```

- [ ] **Step 2: API 타입을 고친다**

`frontend/lib/api.ts`의 부스 타입에 필드를 더한다.

```ts
export interface AdminBooth {
  id: string;
  code: string;
  name: string;
  description: string | null;
  zone: BoothZone;
  competencies: string[];
  qr_url: string;
  created_at: string;
}

export interface AdminBoothCreatePayload {
  name: string;
  description: string | null;
  zone: BoothZone;
  competencies: string[];
}

// 보내지 않은 필드는 서버가 기존 값을 유지한다.
// description에 null을 명시하면 설명이 지워진다.
export interface AdminBoothUpdatePayload {
  name?: string;
  description?: string | null;
  zone?: BoothZone;
  competencies?: string[];
}
```

import에 `import type { BoothZone } from "@/lib/competencies";`를 더한다.

프로필 타입도 함께 고친다.

```ts
// 역량 10개 점수 — 방문한 부스에 연결된 역량이 1점씩 오른다. 0점도 빠짐없이 내려온다.
export interface ProfileCompetencyScore {
  key: string;
  label: string;
  score: number;
}
```

`ProfileSummary`에 `competencies?: ProfileCompetencyScore[];`를 더한다. 배포 순서상 구버전 서버가 안 내려줄 수 있어 선택 필드로 둔다(`booths`와 같은 이유).

- [ ] **Step 3: 폼에 존·역량 입력을 더한다**

`frontend/components/admin/BoothFormDialog.tsx`. `onSubmit` 타입을 바꾼다.

```ts
  onSubmit: (values: {
    name: string;
    description: string | null;
    zone: BoothZone;
    competencies: string[];
  }) => void;
```

`BoothFormBody` 안에 상태를 더한다.

```tsx
  const [zone, setZone] = useState<BoothZone>(booth?.zone ?? "");
  const [competencies, setCompetencies] = useState<string[]>(booth?.competencies ?? []);
```

존은 기본 `select`로 둔다. 값이 5개뿐이라 별도 컴포넌트를 만들지 않는다.

```tsx
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-bold text-ink">존</span>
    <select
      value={zone}
      onChange={(e) => setZone(e.target.value as BoothZone)}
      className="h-10 rounded-md border border-solid border-input bg-background px-3 text-sm"
    >
      {(Object.keys(ZONE_LABELS) as BoothZone[]).map((z) => (
        <option key={z} value={z}>
          {ZONE_LABELS[z]}
        </option>
      ))}
    </select>
  </label>
```

역량은 체크박스 10개로 둔다.

```tsx
  <fieldset className="flex flex-col gap-1.5">
    <legend className="text-sm font-bold text-ink">역량</legend>
    <p className="text-xs text-ink-muted">
      {REQUIRED_COMPETENCY_COUNT[zone] === null
        ? "존을 고르면 필요한 개수를 알려줘요."
        : `${REQUIRED_COMPETENCY_COUNT[zone]}개를 골라주세요. 지금 ${competencies.length}개.`}
    </p>
    <div className="flex flex-wrap gap-2">
      {COMPETENCIES.map((c) => {
        const on = competencies.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() =>
              setCompetencies((prev) =>
                prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
              )
            }
            className={
              on
                ? "rounded-full border border-solid border-sky-400 bg-sky-50 px-3 py-1 text-sm font-bold text-sky-700"
                : "rounded-full border border-solid border-input px-3 py-1 text-sm text-ink-muted"
            }
          >
            {c.label}
          </button>
        );
      })}
    </div>
  </fieldset>
```

제출부에서 `zone`과 `competencies`를 함께 넘긴다. 개수가 맞지 않아도 막지 않는다 — 매핑 자료가 오기 전에는 0개가 정상이다. 안내 문구만 보여준다.

import에 `import { COMPETENCIES, REQUIRED_COMPETENCY_COUNT, ZONE_LABELS, type BoothZone } from "@/lib/competencies";`를 더한다.

- [ ] **Step 4: 목록에 존 컬럼과 필터를 더한다**

`frontend/components/console/BoothListView.tsx`.

상태를 더한다.

```tsx
  const [zoneFilter, setZoneFilter] = useState<BoothZone | "all">("all");
```

목록을 거른다.

```tsx
  const visible = zoneFilter === "all" ? booths : booths.filter((b) => b.zone === zoneFilter);
```

헤더 아래에 필터 버튼 줄을 둔다.

```tsx
  <div className="flex flex-wrap gap-2">
    {(["all", "F", "L", "Y", "C", ""] as const).map((z) => (
      <Button
        key={z || "none"}
        variant={zoneFilter === z ? "default" : "outline"}
        size="sm"
        onClick={() => setZoneFilter(z)}
      >
        {z === "all" ? "전체" : ZONE_LABELS[z]}
        {z !== "all" && ` ${booths.filter((b) => b.zone === z).length}`}
      </Button>
    ))}
  </div>
```

표에 존 열을 더한다. `TableHeader`에 `<TableHead>존</TableHead>`를, 각 행에 `<TableCell>{ZONE_LABELS[booth.zone]}</TableCell>`을 넣는다. `booths.map`을 `visible.map`으로 바꾼다.

`handleSubmit`이 폼에서 받은 `zone`·`competencies`를 그대로 API에 넘기게 고친다.

인쇄 페이지로 가는 버튼을 헤더에 둔다(Task 6에서 페이지를 만든다).

```tsx
  <Button variant="outline" size="sm" onClick={() => router.push("/admin/booths/print")}>
    QR 일괄 인쇄
  </Button>
```

- [ ] **Step 5: 참여 통계 응답에 존을 싣는다**

통계 화면을 존으로 묶으려면 각 행이 어느 존인지 알아야 한다. 집계는 그대로 서버가 하고
**존 필드 하나만** 더한다. 프론트가 부스 목록을 따로 한 번 더 받아 붙이는 것보다 작다.

`backend/app/repositories/booth_visit_repo.py`의 `BoothVisitCountRow`에 필드를 더한다.

```python
    booth_id: UUID
    code: str
    name: str
    zone: str
    visit_count: int
```

`count_by_booth`의 쿼리를 고친다.

```python
            select b.id, b.code, b.name, b.zone, count(v.id) as visit_count
```

`group by b.id, b.code, b.name`을 `group by b.id, b.code, b.name, b.zone`으로 바꾸고,
아래에서 `BoothVisitCountRow(...)`를 만드는 부분에 `zone=row["zone"]`을 더한다.

`backend/app/schemas/booths.py`의 `BoothVisitStat`에도 더한다.

```python
class BoothVisitStat(BaseModel):
    """부스 1개의 방문 집계."""

    booth_id: UUID
    code: str
    name: str
    zone: BoothZone = ""
    visit_count: int = Field(..., description="이 부스를 찍은 학생 수")
```

`backend/app/services/booth_visit_service.py`에서 `BoothVisitStat`을 만드는 곳에
`zone=row.zone`을 더한다(`# type: ignore[arg-type]`와 사유 주석은 `_to_response`와 같은 이유로 필요하면 붙인다).

Run: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: 전부 통과. `test_booth_stats.py`가 깨지면 가짜 행에 `zone`을 더한다.

- [ ] **Step 6: 통계 화면을 존으로 묶는다**

`frontend/lib/api.ts`의 `BoothVisitStat`에 `zone: BoothZone;`을 더한다.

`frontend/components/console/BoothStatsView.tsx`에서 부스 목록을 존별로 나눠 그린다.
막대의 기준값(`max`)은 **전체 기준을 그대로 쓴다.** 존마다 기준이 달라지면 막대 길이를
존 사이에서 비교할 수 없다.

```tsx
  // 존별로 묶어 보여준다. 집계 자체는 서버가 하고, 화면은 나누기만 한다.
  const groups = (["F", "L", "Y", "C", ""] as const)
    .map((zone) => ({
      zone,
      rows: (stats?.booths ?? []).filter((b) => b.zone === zone),
    }))
    .filter((g) => g.rows.length > 0);
```

기존에 `stats.booths.map(...)`으로 행을 그리던 자리를 그룹 단위로 바꾸고, 그룹마다
`ZONE_LABELS[zone]` 제목을 붙인다. 행을 그리는 마크업 자체는 그대로 둔다.

import에 `import { ZONE_LABELS } from "@/lib/competencies";`를 더한다.

- [ ] **Step 7: 프론트 품질 게이트를 돌린다**

Run: `cd frontend && npm run lint && npm run build`
Expected: 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add backend/app/repositories/booth_visit_repo.py backend/app/schemas/booths.py backend/app/services/booth_visit_service.py backend/tests frontend/lib/api.ts frontend/lib/competencies.ts frontend/components/admin/BoothFormDialog.tsx frontend/components/console/BoothListView.tsx frontend/components/console/BoothStatsView.tsx
git commit -m "feat: 관리자 부스 화면에 존 구분과 역량 선택 추가

부스 67개가 한 목록에 평평하게 쌓이면 현장에서 찾지 못한다. 존 열과 존 필터를 넣고,
등록·수정 폼에서 역량을 고를 수 있게 하고, 참여 현황을 존별로 묶어 보여준다.
통계 집계는 그대로 서버가 하고 응답에 존 필드 하나만 더한다.

역량 개수가 맞지 않아도 저장을 막지 않는다. 주최측 매핑 자료가 오기 전에는 0개가
정상이라 막으면 아무것도 등록하지 못한다. 필요한 개수는 안내 문구로만 알린다."
```

---

### Task 6: QR 일괄 인쇄 페이지

**Files:**
- Create: `frontend/components/admin/BoothPrintSheet.tsx`
- Create: `frontend/app/admin/booths/print/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `AdminBooth.zone`, `ZONE_LABELS`, 기존 `renderBoothQrPng(qrUrl, code)`, `fetchAdminBooths(token)`
- Produces: `BoothPrintSheet({ booths }: { booths: AdminBooth[] })`

- [ ] **Step 1: 인쇄 격자 컴포넌트를 만든다**

`frontend/components/admin/BoothPrintSheet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { renderBoothQrPng } from "@/lib/boothQr";
import { ZONE_LABELS } from "@/lib/competencies";
import type { AdminBooth } from "@/lib/api";

/**
 * 인쇄용 QR 격자. 부스 한 칸에 QR·이름·기관·코드를 함께 찍는다.
 *
 * QR PNG는 canvas로 그리므로 브라우저에서만 만들어진다. 부스 수만큼(최대 70장) 한 번
 * 그려서 상태에 담아 두고, 다시 그리지 않는다.
 */
export function BoothPrintSheet({ booths }: { booths: AdminBooth[] }) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      booths.map(async (b) => [b.id, await renderBoothQrPng(b.qr_url, b.code)] as const)
    ).then((pairs) => {
      if (active) setImages(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, [booths]);

  return (
    <div className="grid grid-cols-2 gap-4 print:grid-cols-2">
      {booths.map((booth) => (
        <div
          key={booth.id}
          className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border border-solid border-slate-300 p-4"
        >
          {images[booth.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- canvas가 만든 data URL이라 next/image가 처리할 수 없다
            <img src={images[booth.id]} alt="" className="w-40" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded bg-slate-100" />
          )}
          <p className="text-center text-base font-bold">{booth.name}</p>
          <p className="text-center text-xs text-slate-500">{booth.description ?? ""}</p>
          <p className="text-xs text-slate-400">
            {ZONE_LABELS[booth.zone]} · {booth.code}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 인쇄 페이지를 만든다**

`frontend/app/admin/booths/print/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BoothPrintSheet } from "@/components/admin/BoothPrintSheet";
import { useConsole } from "@/components/console/ConsoleProvider";
import { Button } from "@/components/ui/button";
import { ZONE_LABELS, type BoothZone } from "@/lib/competencies";
import { ApiError, fetchAdminBooths, type AdminBooth } from "@/lib/api";

/**
 * 부스 QR 일괄 인쇄. 존을 고르고 브라우저 인쇄를 쓴다.
 *
 * PDF 생성기를 넣지 않는다. 인쇄는 브라우저가 이미 할 줄 알고, 결과물을 미리보기로
 * 확인한 뒤 뽑을 수 있어야 한다.
 */
export default function BoothPrintPage() {
  const router = useRouter();
  const { getToken, clearToken, loginPath } = useConsole();
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [zone, setZone] = useState<BoothZone | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace(loginPath);
      return;
    }
    try {
      setBooths(await fetchAdminBooths(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace(loginPath);
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [clearToken, getToken, loginPath, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = zone === "all" ? booths : booths.filter((b) => b.zone === zone);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="mr-auto text-xl font-extrabold">부스 QR 일괄 인쇄</h1>
        {(["all", "F", "L", "Y", "C"] as const).map((z) => (
          <Button
            key={z}
            variant={zone === z ? "default" : "outline"}
            size="sm"
            onClick={() => setZone(z)}
          >
            {z === "all" ? "전체" : ZONE_LABELS[z]}
          </Button>
        ))}
        <Button size="sm" onClick={() => window.print()} disabled={visible.length === 0}>
          인쇄
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">부스를 불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">이 존에 등록된 부스가 없어요.</p>
      ) : (
        <BoothPrintSheet booths={visible} />
      )}
    </main>
  );
}
```

- [ ] **Step 3: 인쇄용 CSS를 확인한다**

Tailwind의 `print:` 변형으로 처리한다. 별도 CSS 파일을 만들지 않는다. 위 코드에서 조작 줄에 `print:hidden`, 각 칸에 `break-inside-avoid`가 이미 붙어 있다. 브라우저 인쇄 미리보기에서 칸이 쪽 경계에서 잘리지 않는지 눈으로 확인한다.

- [ ] **Step 4: 실제로 열어 확인한다**

Run: `cd frontend && npm run dev`

브라우저에서 `http://localhost:4000/admin/booths/print`를 열고 관리자로 로그인한 상태에서 확인한다.
Expected: QR 격자가 보이고, 존 버튼이 목록을 거르고, 인쇄 미리보기에서 조작 줄이 사라진다.

- [ ] **Step 5: 프론트 품질 게이트를 돌린다**

Run: `cd frontend && npm run lint && npm run build`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add frontend/components/admin/BoothPrintSheet.tsx frontend/app/admin/booths/print/page.tsx
git commit -m "feat: 부스 QR 일괄 인쇄 페이지 추가

QR을 한 장씩 모달로 열면 67번 반복해야 한다. 존을 골라 격자로 깔고 브라우저 인쇄를 쓴다.
PDF 생성기를 넣지 않는다 — 인쇄는 브라우저가 이미 할 줄 안다.

QR 링크의 base는 서버가 FRONTEND_ORIGIN으로 조립해 내려주므로 로컬에서 뽑아도
인쇄물에 localhost가 박히지 않는다."
```

---

### Task 7: 성향 탭 차트를 역량으로 교체

**Files:**
- Create: `frontend/lib/competencies.test.ts`
- Modify: `frontend/lib/competencies.ts`
- Modify: `frontend/app/(tabs)/tendency/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `ProfileSummary.competencies`, Task 5의 `COMPETENCIES`
- Produces: `toChartData(scores: ProfileCompetencyScore[] | undefined) -> { label: string; score: number }[]`, `hasAnyScore(scores) -> boolean`

- [ ] **Step 1: 차트 데이터 변환 테스트를 쓴다**

`frontend/lib/competencies.test.ts` (새 파일):

```ts
import { describe, expect, it } from "vitest";
import { hasAnyScore, toChartData } from "@/lib/competencies";

describe("toChartData", () => {
  it("응답이 없으면 10개 축을 0으로 채운다", () => {
    const data = toChartData(undefined);

    expect(data).toHaveLength(10);
    expect(data.every((d) => d.score === 0)).toBe(true);
  });

  it("축 순서는 항상 역량 정의 순서다", () => {
    const data = toChartData([
      { key: "planning", label: "계획성", score: 3 },
      { key: "communication", label: "의사소통", score: 1 },
    ]);

    expect(data[0].label).toBe("의사소통");
    expect(data[9].label).toBe("계획성");
    expect(data[0].score).toBe(1);
    expect(data[9].score).toBe(3);
  });

  it("응답에 없는 역량은 0으로 채운다", () => {
    const data = toChartData([{ key: "empathy", label: "공감", score: 2 }]);

    expect(data).toHaveLength(10);
    expect(data.find((d) => d.label === "공감")?.score).toBe(2);
    expect(data.find((d) => d.label === "협업")?.score).toBe(0);
  });
});

describe("hasAnyScore", () => {
  it("전부 0이면 false — 매핑이 아직 비어 있다는 뜻이다", () => {
    expect(hasAnyScore([{ key: "empathy", label: "공감", score: 0 }])).toBe(false);
  });

  it("하나라도 1점 이상이면 true", () => {
    expect(hasAnyScore([{ key: "empathy", label: "공감", score: 1 }])).toBe(true);
  });

  it("응답이 없으면 false", () => {
    expect(hasAnyScore(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npm run test`
Expected: FAIL — `toChartData`를 찾을 수 없다

- [ ] **Step 3: 변환 함수를 더한다**

`frontend/lib/competencies.ts` 끝에:

```ts
// 점수 배열의 형태만 요구한다. api.ts의 ProfileCompetencyScore를 import하지 않는 이유는
// api.ts가 이 파일의 BoothZone을 가져다 쓰기 때문이다 — 타입만 오가면 런타임 순환은
// 없지만, 한쪽 방향으로만 의존하게 두는 편이 읽기 쉽다.
type Scored = { key: string; score: number };

/**
 * 레이더 차트에 넣을 10개 축. 응답에 빠진 역량은 0으로 채운다.
 *
 * 축을 서버 응답 순서가 아니라 COMPETENCIES 순서로 고정한다. 축 순서가 화면마다
 * 달라지면 같은 학생의 그래프가 다르게 보인다.
 */
export function toChartData(
  scores: readonly Scored[] | undefined
): { label: string; score: number }[] {
  const byKey = new Map((scores ?? []).map((s) => [s.key, s.score]));
  return COMPETENCIES.map((c) => ({ label: c.label, score: byKey.get(c.key) ?? 0 }));
}

/** 점수가 하나라도 있는지. 전부 0이면 차트 대신 빈 상태를 보여준다. */
export function hasAnyScore(scores: readonly Scored[] | undefined): boolean {
  return (scores ?? []).some((s) => s.score > 0);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npm run test`
Expected: PASS

- [ ] **Step 5: 성향 탭을 고친다**

`frontend/app/(tabs)/tendency/page.tsx`. 상태를 프로필 전체가 아니라 역량 점수로 바꾼다.

```tsx
  const [scores, setScores] = useState<ProfileCompetencyScore[] | null>(null);
```

`getMyProfile` 성공부를 고친다.

```tsx
        if (active) setScores(profile.competencies ?? []);
```

차트 데이터와 빈 상태 판단을 바꾼다.

```tsx
  // 축은 항상 역량 10개로 고정이다. 부스가 몇 개로 늘어도 차트 모양이 무너지지 않는다.
  const chartData = toChartData(scores ?? undefined);
  const empty = !hasAnyScore(scores ?? undefined);
```

`chartData.length === 0` 분기를 `empty`로 바꾸고, 안내 문구를 고친다.

```tsx
  <p className="text-sm font-bold text-ink-muted">아직 데이터가 없어.</p>
  <p className="text-xs font-medium text-ink-muted/70">
    부스를 돌아보면 여기에 역량 그래프가 그려질 거야.
  </p>
```

머리말도 바꾼다.

```tsx
  <p className="mt-1.5 text-sm font-medium text-ink-muted">
    돌아본 부스에서 키운 역량을 그려봐.
  </p>
```

차트 축과 눈금을 바꾼다. `dataKey`를 `label`·`score`로, 반지름 축의 고정 `domain={[0, 1]}`을 지운다. 점수 상한이 없어 자동 범위를 쓴다.

```tsx
  <RadarChart data={chartData} outerRadius="68%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
    <PolarGrid stroke="#cfe3f5" />
    <PolarAngleAxis
      dataKey="label"
      tick={{ fill: "#4c6a82", fontSize: 10, fontWeight: 700 }}
    />
    <PolarRadiusAxis tick={false} axisLine={false} />
    <Radar dataKey="score" stroke="#0284c7" fill="#38bdf8" fillOpacity={0.45} />
  </RadarChart>
```

import를 정리한다. `ProfileBoothStatus`를 더 쓰지 않으면 지우고, `ProfileCompetencyScore`와 `hasAnyScore`·`toChartData`를 더한다.

- [ ] **Step 6: 프론트 품질 게이트를 돌린다**

Run: `cd frontend && npm run lint && npm run build && npm run test`
Expected: 전부 통과

- [ ] **Step 7: 실제로 열어 확인한다**

Run: `cd frontend && npm run dev`

학생으로 로그인해 성향 탭을 연다.
Expected: 역량 매핑이 비어 있으므로 빈 상태 안내가 보인다. 관리자 화면에서 부스 하나에 역량 3개를 붙이고 그 부스 QR을 찍으면 축 3개가 올라간 레이더가 보인다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/lib/competencies.ts frontend/lib/competencies.test.ts "frontend/app/(tabs)/tendency/page.tsx"
git commit -m "feat: 성향 탭 차트 축을 부스에서 역량 10개로 교체

차트가 부스마다 축을 하나씩 만들고 방문 여부를 0/1로 찍고 있었다. 부스가 67개가 되면
축 67개로 무너진다. 축을 역량 10개로 고정하면 부스가 몇 개로 늘어도 모양이 유지된다.

역량 매핑이 비어 있는 동안에는 모든 축이 0이 된다. 이때는 차트 대신 빈 상태 안내를
띄운다 — 0점짜리 레이더는 고장으로 보인다."
```

---

### Task 8: 문서 갱신

**Files:**
- Modify: `docs/guides/architecture.md`
- Modify: `docs/guides/booths.md`

**Interfaces:**
- Consumes: Task 1~7의 결과

- [ ] **Step 1: 아키텍처 문서를 고친다**

`docs/guides/architecture.md`에서 다음을 고친다.

- `ops` 스키마 표에 `booth_competencies`를 더한다: `| ops | settings booths booth_competencies booth_visits | 운영 설정·부스·역량 연결·방문 기록 |`
- 화면 목록에 `/admin/booths/print`(부스 QR 일괄 인쇄)를 더한다.
- 4탭 설명에서 성향 탭이 역량 10개를 축으로 삼는다고 적는다.
- 문서 하단 변경 이력에 한 줄 더한다: `| 2026-09-11 | 부스에 존(F·L·Y·C)과 NCS 역량 10개 연결 추가. 성향 탭 차트 축을 부스에서 역량으로 교체. QR 일괄 인쇄 페이지 추가 |`

- [ ] **Step 2: 부스 명단 문서를 고친다**

`docs/guides/booths.md`의 `## 시스템에 넣을 때` 절을 현재 사실로 바꾼다. "존을 담을 컬럼이 없다"는 더 이상 사실이 아니다.

```markdown
## 시스템에 넣을 때

- **존은 `ops.booths.zone`에 들어간다.** `F`·`L`·`Y`·`C` 네 값이고 `C`가 역량체험존이다.
- **역량은 `ops.booth_competencies`에 들어간다.** 직업체험 부스는 3개, 역량체험 부스는 1개.
  **아직 비어 있다** — 부스별 역량 매핑은 주최측 자료를 기다리는 중이다.
- **등록은 `backend/scripts/seed_booths.py`로 한다.** 명단은 `backend/scripts/booths.csv`에 있고,
  이름(체험주제)으로 중복을 걸러 다시 돌려도 안전하다. 매핑 자료가 오면 CSV의 역량 칸을
  채워 다시 돌리면 된다.
- **QR 인쇄는 `/admin/booths/print`에서 한다.** 존을 골라 한 번에 뽑는다.
- `code`는 인쇄물에 박히면 되돌릴 수 없다. QR 인쇄 전 실물 테스트는 [`operations.md`](operations.md) 참고.
```

변경 이력에 한 줄 더한다: `| 2026-09-11 | 시스템 반영 절을 현행화 — 존 컬럼·역량 연결 테이블·시드 스크립트·QR 일괄 인쇄 |`

- [ ] **Step 3: 커밋**

```bash
git add docs/guides/architecture.md docs/guides/booths.md
git commit -m "docs: 부스 존·역량 반영으로 아키텍처와 부스 명단 문서 갱신"
```

---

## 마지막 확인

- [ ] 백엔드 전체 게이트: `cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
- [ ] 프론트 전체 게이트: `cd frontend && npm run lint && npm run build && npm run test`
- [ ] 마이그레이션 0013·0014를 로컬 DB에 적용하고 `uv run python -m scripts.seed_booths ... --dry-run`이 67건을 보고하는지 확인
- [ ] `production` 머지 전 확인: `backend/**`가 바뀌므로 머지 즉시 자동 재배포된다. 행사 기간에는 머지하지 않는다([`../../guides/operations.md`](../../guides/operations.md))
- [ ] 마이그레이션은 코드 배포보다 **먼저** 적용한다([`../../guides/deployment.md`](../../guides/deployment.md))
