# 개인 참여자 + 관리자 발급 테스트 계정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 계정에 종류(`kind`) 구분을 도입해 학교 없는 개인 참여자를 받고, 관리자만 발급·진입할 수 있는 테스트 계정으로 운영 DB 오염을 없앤다.

**Architecture:** `pii.students`에 `kind text` 컬럼(`student`/`guest`/`test`)을 추가하고, 학교 없는 계정은 `school=''`·`grade/class_no/student_no=0`으로 저장하되 **이름으로** 유니크를 잡는다. 로그인은 학교 소속이면 기존 식별 키, 개인이면 이름+비밀번호로 갈라진다. 테스트 계정은 로그인 경로에서 제외하고 관리자 인증으로 발급받는 학생 토큰으로만 진입한다.

**Tech Stack:** FastAPI · asyncpg(Postgres/Supabase) · pydantic v2 · pytest / Next.js 16 · TypeScript · Zustand · vitest

**설계 문서:** `docs/superpowers/specs/2026-08-08-guest-and-test-accounts-design.md`

## Global Constraints

- 커밋 메시지는 Conventional Commits 접두사 + **한국어** 설명. 자동 생성 푸터·서명 금지.
- 백엔드 품질 게이트: `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app` · `uv run pytest` (mypy는 `strict`).
- 프론트 품질 게이트: `npm run lint` · `npm run build` · `npm run test`.
- 백엔드 명령은 `backend/`에서 `uv run`으로만 실행한다. 프론트는 `frontend/`에서 `npm`.
- `kind` 값은 정확히 `'student'` · `'guest'` · `'test'` 세 가지.
- 학교 없는 계정의 고정값: `school=''`, `grade=0`, `class_no=0`, `student_no=0`.
- 비밀번호는 평문 저장 정책을 유지한다(해싱하지 않는다).
- UI 텍스트는 한국어.

## File Structure

**백엔드 (생성)**
- `backend/supabase/migrations/0009_add_students_kind.sql` — `kind` 컬럼 + 유니크 인덱스 교체

**백엔드 (수정)**
- `app/repositories/student_repo.py` — `StudentRecord.kind`, `create(kind=...)`, `get_by_name`, `list_by_kind`, 조회 필터
- `app/schemas/auth.py` — `RegisterRequest`·`LoginRequest`를 optional + validator로
- `app/services/auth_service.py` — 가입·로그인 분기
- `app/routers/auth.py` — 새 필드 전달
- `app/schemas/admin.py` — 테스트 계정 발급·토큰·정리 모델, `AdminStudentItem.kind`
- `app/services/admin_service.py` — 발급·토큰·일괄 정리, 목록 필터
- `app/routers/admin.py` — 엔드포인트 3개
- `app/services/session_service.py` — 테스트 계정 설문 반복

**프론트 (수정)**
- `lib/api.ts` — 페이로드 타입 유니온, 관리자 API 3개
- `components/auth/SchoolSelect.tsx` — 학교급 state를 상위로 이관
- `components/auth/IdentityFields.tsx` — 탭 3개 소유, 개인 모드 분기
- `app/login/page.tsx` · `app/signup/page.tsx` — 개인 모드 검증·호출 분기
- `app/(tabs)/profile/[id]/page.tsx` — 학교 없는 계정 표시
- `app/admin/page.tsx` — 발급·테스트 시작·일괄 삭제 UI

---

### Task 1: `kind` 컬럼과 저장소 반영

**Files:**
- Create: `backend/supabase/migrations/0009_add_students_kind.sql`
- Modify: `backend/app/repositories/student_repo.py:19-22` (`_COLUMNS`), `:25-41` (`StudentRecord`), `:55-69` (`_to_record`), `:73-122` (`create`)
- Modify: `backend/tests/test_auth_service.py:22-70` (`FakeStudentRepo`)

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces:
  - `StudentRecord.kind: str` — `'student'` | `'guest'` | `'test'`
  - `StudentRepository.create(..., kind: str = "student") -> StudentRecord`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/0009_add_students_kind.sql`:

```sql
-- pii.students 에 계정 종류(kind) 추가.
--
-- 'student' : 학교 소속 학생 (기존 전원 — 기본값으로 백필된다)
-- 'guest'   : 학교 없는 개인·성인 참여자
-- 'test'    : 관리자가 발급한 테스트 계정 (학생 로그인 화면으로 진입 불가)
--
-- guest·test는 학교가 없어 school=''·grade/class_no/student_no=0 으로 저장한다.
-- 그 값으로는 기존 유니크가 성립하지 않으므로 인덱스를 둘로 나눈다.
--   - 학교 소속: (school, grade, class_no, student_no)
--   - 학교 없음: (name) — 동명이인 가입을 막아 이름 로그인을 확정적으로 만든다
-- guest와 test가 같은 이름 공간을 쓴다. 로그인은 guest만 조회하므로 모호해지지 않지만,
-- 관리자 목록에 같은 이름이 둘 보이는 혼동을 막기 위해 공통으로 둔다.

alter table pii.students
    add column if not exists kind text not null default 'student'
    check (kind in ('student', 'guest', 'test'));

-- DROP과 CREATE를 한 트랜잭션으로 묶는다. 트랜잭션이 테이블 쓰기를 잠그므로
-- 인덱스가 없는 순간에 중복 가입이 끼어들 창이 생기지 않는다.
begin;

drop index if exists pii.students_login_key;

create unique index students_login_key
    on pii.students (school, grade, class_no, student_no)
    where deleted_at is null and kind = 'student';

create unique index students_name_key
    on pii.students (name)
    where deleted_at is null and kind in ('guest', 'test');

commit;
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_auth_service.py` 맨 아래에 추가:

이 파일은 `asyncio_mode = auto`라 `@pytest.mark.asyncio` 데코레이터를 붙이지 않는다.
헬퍼는 기존 것을 그대로 쓴다 — `_service() -> (AuthService, FakeStudentRepo, FakeStorage)`,
`_register_kwargs(**overrides) -> dict`.

```python
async def test_register_stores_student_kind() -> None:
    """학교 소속 가입은 kind='student'로 저장된다."""
    service, _repo, _ = _service()

    student, _token = await service.register_student(**_register_kwargs())

    assert student.kind == "student"
```

- [ ] **Step 3: 테스트를 실행해 실패를 확인**

Run: `cd backend && uv run pytest tests/test_auth_service.py::test_register_stores_student_kind -v`
Expected: FAIL — `AttributeError: 'StudentRecord' object has no attribute 'kind'`

- [ ] **Step 4: `StudentRecord`에 `kind` 추가**

`app/repositories/student_repo.py`:

```python
_COLUMNS = (
    "id, school, grade, class_no, student_no, name, "
    "password, gender, photo_key, consent_privacy, kind, created_at, deleted_at"
)
```

`StudentRecord`에 필드 추가 (`consent_privacy` 다음):

```python
    consent_privacy: bool
    kind: str  # 'student' | 'guest' | 'test'
    created_at: datetime
    deleted_at: datetime | None
```

`_to_record`에 매핑 추가:

```python
        consent_privacy=row["consent_privacy"],
        kind=row["kind"],
        created_at=row["created_at"],
```

- [ ] **Step 5: `create`가 `kind`를 받도록 수정**

`app/repositories/student_repo.py`의 `create` 시그니처에 `kind: str = "student"`를 추가하고(마지막 키워드 인자), 쿼리를 바꾼다:

```python
        query = f"""
            insert into pii.students (
                school, grade, class_no, student_no, name, password, gender,
                consent_privacy, kind
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning {_COLUMNS}
        """
```

`conn.fetchrow(query, school, grade, class_no, student_no, name, password, gender, consent_privacy, kind)`로 인자를 하나 늘린다.

`UniqueViolationError` 핸들러의 메시지를 종류에 따라 나눈다:

```python
        except asyncpg.UniqueViolationError as exc:
            if kind == "student":
                raise ConflictError(
                    "이미 등록된 학생입니다.",
                    details={
                        "school": school,
                        "grade": grade,
                        "class_no": class_no,
                        "student_no": student_no,
                    },
                ) from exc
            # 학교 없는 계정은 이름으로 유니크하다(students_name_key).
            raise ConflictError(
                "이미 사용 중인 이름입니다.",
                details={"name": name},
            ) from exc
```

- [ ] **Step 6: `FakeStudentRepo`를 새 시그니처에 맞추기**

`backend/tests/test_auth_service.py`의 `FakeStudentRepo.create`에 `kind: str = "student"`를 추가하고, 만드는 `StudentRecord`에 `kind=kind`를 넘긴다. 학교 없는 계정을 흉내내기 위해 이름 유니크도 구현한다:

```python
    async def create(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
        name: str,
        password: str,
        gender: str,
        consent_privacy: bool,
        kind: str = "student",
    ) -> StudentRecord:
        if kind == "student":
            key = self._key(school, grade, class_no, student_no)
            if key in self._by_key:
                raise ConflictError("이미 등록된 학생입니다.")
        elif any(
            r.name == name and r.kind in ("guest", "test") for r in self._by_id.values()
        ):
            raise ConflictError("이미 사용 중인 이름입니다.")

        record = StudentRecord(
            id=uuid4(),
            school=school,
            grade=grade,
            class_no=class_no,
            student_no=student_no,
            name=name,
            password=password,
            gender=gender,
            photo_key=None,
            consent_privacy=consent_privacy,
            kind=kind,
            created_at=datetime.now(UTC),
            deleted_at=None,
        )
        if kind == "student":
            self._by_key[self._key(school, grade, class_no, student_no)] = record
        self._by_id[record.id] = record
        return record
```

- [ ] **Step 7: 다른 테스트의 `StudentRecord(...)` 직접 생성부 수정**

Run: `cd backend && grep -rn "StudentRecord(" tests/ app/`
`kind=` 없이 `StudentRecord(...)`를 만드는 곳마다 `kind="student"`를 추가한다 (dataclass에 기본값이 없으므로 전부 필요하다).

- [ ] **Step 8: 테스트 전체 실행**

Run: `cd backend && uv run pytest -q`
Expected: PASS (전부)

- [ ] **Step 9: 품질 게이트 + 커밋**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/supabase/migrations/0009_add_students_kind.sql backend/app/repositories/student_repo.py backend/tests/
git commit -m "feat: 학생 계정 종류(kind) 구분 추가"
```

---

### Task 2: 학교 없는 계정 조회 저장소 메서드

**Files:**
- Modify: `backend/app/repositories/student_repo.py` (`get_by_name`, `list_by_kind` 추가)
- Modify: `backend/tests/test_auth_service.py` (`FakeStudentRepo`에 같은 메서드 추가)

**Interfaces:**
- Consumes: Task 1의 `StudentRecord.kind`
- Produces:
  - `StudentRepository.get_by_name(name: str, *, kinds: tuple[str, ...]) -> StudentRecord | None`
  - `StudentRepository.list_by_kind(kind: str) -> list[StudentRecord]`

- [ ] **Step 1: 메서드 추가**

`app/repositories/student_repo.py`의 `get_by_id` 아래에 넣는다:

```python
    async def get_by_name(self, name: str, *, kinds: tuple[str, ...]) -> StudentRecord | None:
        """이름으로 학교 없는 계정을 조회한다. 없으면 None.

        kinds로 조회 대상을 좁힌다 — 로그인은 ('guest',)만 넘겨 테스트 계정이
        학생 로그인 화면으로 진입하지 못하게 한다. students_name_key가
        (guest, test) 전체에서 이름 유니크를 보장하므로 결과는 최대 1행이다.
        """
        query = f"""
            select {_COLUMNS}
            from pii.students
            where name = $1
              and kind = any($2::text[])
              and deleted_at is null
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, name, list(kinds))
        return _to_record(row) if row is not None else None

    async def list_by_kind(self, kind: str) -> list[StudentRecord]:
        """특정 종류의 계정 전체 조회 — 테스트 계정 일괄 정리에 쓴다."""
        query = f"""
            select {_COLUMNS}
            from pii.students
            where kind = $1
              and deleted_at is null
            order by created_at
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, kind)
        return [_to_record(row) for row in rows]
```

- [ ] **Step 2: `FakeStudentRepo`에 같은 메서드 구현**

`backend/tests/test_auth_service.py`의 `FakeStudentRepo`에 추가한다. Task 3·5의 테스트가
이 fake를 통해 두 메서드를 검증하므로, 여기서는 별도 테스트를 두지 않는다:

```python
    async def get_by_name(self, name: str, *, kinds: tuple[str, ...]) -> StudentRecord | None:
        for record in self._by_id.values():
            if record.name == name and record.kind in kinds and record.deleted_at is None:
                return record
        return None

    async def list_by_kind(self, kind: str) -> list[StudentRecord]:
        return [
            r for r in self._by_id.values() if r.kind == kind and r.deleted_at is None
        ]
```

- [ ] **Step 3: 타입 체크 + 커밋**

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/app/repositories/student_repo.py backend/tests/test_auth_service.py
git commit -m "feat: 이름·종류 기준 학생 조회 저장소 메서드 추가"
```

---

### Task 3: 가입 · 로그인 API 분기

**Files:**
- Modify: `backend/app/schemas/auth.py:16-46`
- Modify: `backend/app/services/auth_service.py:22-57` (Protocol), `:91-148` (`register_student`, `login`)
- Modify: `backend/app/routers/auth.py:23-51`
- Test: `backend/tests/test_auth_service.py`, `backend/tests/test_auth_router.py`

**Interfaces:**
- Consumes: Task 1 `create(kind=...)`, Task 2 `get_by_name(name, kinds=...)`
- Produces:
  - `AuthService.register_student(*, school: str | None, grade: int | None, class_no: int | None, student_no: int | None, name: str, password: str, gender: str, consent_privacy: bool) -> tuple[StudentRecord, str]`
  - `AuthService.login(*, school: str | None, grade: int | None, class_no: int | None, student_no: int | None, name: str | None, password: str) -> tuple[StudentRecord, str]`
  - 모듈 상수 `GUEST_SCHOOL = ""`, `GUEST_NUMBER = 0`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_auth_service.py` 아래에 추가:

`_register_kwargs`에 개인 참여자용 헬퍼를 하나 더 둔다(기존 헬퍼 바로 아래):

```python
def _guest_kwargs(**overrides: object) -> dict[str, object]:
    """개인 참여자 등록 인자 — 학교 4개 필드를 전부 None으로 둔다."""
    return _register_kwargs(
        school=None, grade=None, class_no=None, student_no=None, **overrides
    )
```

테스트 본문:

```python
async def test_register_guest_without_school_fields() -> None:
    """학교 정보 없이 가입하면 kind='guest'로 저장되고 학교 필드는 비워진다."""
    service, _, _ = _service()

    student, token = await service.register_student(**_guest_kwargs())

    assert student.kind == "guest"
    assert student.school == ""
    assert (student.grade, student.class_no, student.student_no) == (0, 0, 0)
    payload = decode_token(token, expected_kind=TokenKind.STUDENT, settings=get_settings())
    assert payload["sub"] == str(student.id)


async def test_guest_login_by_name() -> None:
    """개인 참여자는 이름 + 비밀번호로 로그인한다."""
    service, _, _ = _service()
    created, _ = await service.register_student(**_guest_kwargs())

    student, _token = await service.login(
        school=None, grade=None, class_no=None, student_no=None,
        name="홍길동", password="20100101",
    )

    assert student.id == created.id


async def test_guest_duplicate_name_rejected() -> None:
    """같은 이름의 개인 참여자는 가입할 수 없다."""
    service, _, _ = _service()
    await service.register_student(**_guest_kwargs())

    with pytest.raises(ConflictError):
        await service.register_student(**_guest_kwargs(password="99999999"))


async def test_test_account_cannot_login_by_name() -> None:
    """테스트 계정은 이름·비밀번호가 맞아도 학생 로그인 화면으로 들어갈 수 없다."""
    service, repo, _ = _service()
    await repo.create(
        school="", grade=0, class_no=0, student_no=0,
        name="테스트1", password="20100101", gender="male",
        consent_privacy=True, kind="test",
    )

    with pytest.raises(UnauthorizedError):
        await service.login(
            school=None, grade=None, class_no=None, student_no=None,
            name="테스트1", password="20100101",
        )
```

`_register_kwargs`의 기본 이름·비밀번호는 `"홍길동"` / `"20100101"`이다 — 위 테스트는 그 값을 그대로 쓴다.

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `cd backend && uv run pytest tests/test_auth_service.py -k "guest or test_account" -v`
Expected: FAIL — `register_student() got an unexpected keyword argument` 또는 `school=None` 타입 오류

- [ ] **Step 3: `StudentRepo` Protocol 갱신**

`app/services/auth_service.py`의 `StudentRepo` Protocol에 `create`의 `kind` 인자와 새 메서드를 반영한다:

```python
    async def create(
        self,
        *,
        school: str,
        grade: int,
        class_no: int,
        student_no: int,
        name: str,
        password: str,
        gender: str,
        consent_privacy: bool,
        kind: str = ...,
    ) -> StudentRecord: ...

    async def get_by_name(
        self, name: str, *, kinds: tuple[str, ...]
    ) -> StudentRecord | None: ...
```

- [ ] **Step 4: `register_student` · `login` 분기 구현**

`app/services/auth_service.py` 상단(클래스 위)에 상수를 둔다:

```python
# 학교 없는 계정(guest·test)의 학교 식별 필드 고정값.
# 컬럼이 not null이라 값은 채우되 의미를 비운다. 유니크는 이름으로 잡는다.
GUEST_SCHOOL = ""
GUEST_NUMBER = 0
```

`register_student`를 교체한다:

```python
    async def register_student(
        self,
        *,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        student_no: int | None,
        name: str,
        password: str,
        gender: str,
        consent_privacy: bool,
    ) -> tuple[StudentRecord, str]:
        """학생·개인 참여자 등록 → (레코드, 세션 토큰).

        학교 정보가 없으면 개인 참여자(kind='guest')로 만든다. 학교 필드 조합 검증은
        요청 스키마(RegisterRequest)가 이미 마쳤으므로 여기서는 school의 유무만 본다.
        동의 누락은 ForbiddenError, 중복은 ConflictError.
        """
        if not consent_privacy:
            raise ForbiddenError("개인정보 수집·이용에 동의해야 가입할 수 있습니다.")

        if school is None:
            # 이름 중복은 students_name_key가 잡지만, 저장소에 닿기 전에 같은 메시지로 거른다.
            if await self._students.get_by_name(name, kinds=("guest", "test")) is not None:
                raise ConflictError("이미 사용 중인 이름입니다.")
            student = await self._students.create(
                school=GUEST_SCHOOL,
                grade=GUEST_NUMBER,
                class_no=GUEST_NUMBER,
                student_no=GUEST_NUMBER,
                name=name,
                password=password,
                gender=gender,
                consent_privacy=consent_privacy,
                kind="guest",
            )
            return student, self._issue_token(student.id)

        assert grade is not None and class_no is not None and student_no is not None
        existing = await self._students.get_by_login_key(
            school=school, grade=grade, class_no=class_no, student_no=student_no
        )
        if existing is not None:
            raise ConflictError("이미 등록된 학생입니다.")

        student = await self._students.create(
            school=school,
            grade=grade,
            class_no=class_no,
            student_no=student_no,
            name=name,
            password=password,  # 평문 저장 (해시하지 않음)
            gender=gender,
            consent_privacy=consent_privacy,
            kind="student",
        )
        return student, self._issue_token(student.id)
```

`login`을 교체한다:

```python
    async def login(
        self,
        *,
        school: str | None,
        grade: int | None,
        class_no: int | None,
        student_no: int | None,
        name: str | None,
        password: str,
    ) -> tuple[StudentRecord, str]:
        """식별 키 또는 이름 + 비밀번호 검증 → (레코드, 세션 토큰). 실패는 UnauthorizedError.

        이름 조회는 kind='guest'만 본다. 테스트 계정(kind='test')은 관리자 토큰으로만
        진입하며, 이름·비밀번호를 알아도 이 경로로는 들어올 수 없다.
        """
        if name is not None:
            student = await self._students.get_by_name(name, kinds=("guest",))
        else:
            assert school is not None and grade is not None
            assert class_no is not None and student_no is not None
            student = await self._students.get_by_login_key(
                school=school, grade=grade, class_no=class_no, student_no=student_no
            )

        # 존재 여부를 노출하지 않도록 두 경우 모두 동일한 401. (평문 비교)
        if student is None or password != student.password:
            raise UnauthorizedError("학생 정보 또는 비밀번호가 올바르지 않습니다.")

        return student, self._issue_token(student.id)
```

- [ ] **Step 5: 요청 스키마에 validator 추가**

`app/schemas/auth.py`를 교체한다 (`_GRADE` 등 공통 제약은 optional 기본값으로 바꾼다):

```python
from pydantic import BaseModel, Field, model_validator

# 식별 키 구성요소의 공통 제약 — Request 간 재사용.
# 학교 없는 계정(개인 참여자)을 받기 위해 전부 optional이며, 조합은 validator가 강제한다.
_GRADE = Field(None, ge=1, le=12, description="학년 (학교 소속만)")
_CLASS_NO = Field(None, ge=1, le=99, description="반 (학교 소속만)")
_STUDENT_NO = Field(None, ge=1, le=99, description="번호 (학교 소속만)")
_SCHOOL = Field(None, min_length=1, max_length=100, description="학교명 (학교 소속만)")
_PASSWORD = Field(..., min_length=1, max_length=128, description="비밀번호(단순 문자열)")


def _school_field_state(
    school: str | None, grade: int | None, class_no: int | None, student_no: int | None
) -> bool:
    """학교 4개 필드가 전부 있으면 True, 전부 없으면 False. 일부만 있으면 ValueError."""
    fields = (school, grade, class_no, student_no)
    present = [f is not None for f in fields]
    if all(present):
        return True
    if not any(present):
        return False
    raise ValueError("학교·학년·반·번호는 모두 함께 보내거나 모두 생략해야 합니다.")


class RegisterRequest(BaseModel):
    school: str | None = _SCHOOL
    grade: int | None = _GRADE
    class_no: int | None = _CLASS_NO
    student_no: int | None = _STUDENT_NO
    name: str = Field(..., min_length=1, max_length=50, description="이름")
    password: str = _PASSWORD
    gender: Literal["male", "female"] = Field(..., description="성별 (male=남, female=여)")
    consent_privacy: bool = Field(
        ..., description="개인정보 수집·이용 동의 (가입 필수, false면 거부됨)"
    )

    @model_validator(mode="after")
    def _school_fields_all_or_none(self) -> RegisterRequest:
        """학교 필드를 전부 보내면 학교 소속, 전부 생략하면 개인 참여자로 가입한다."""
        _school_field_state(self.school, self.grade, self.class_no, self.student_no)
        return self
```

`LoginRequest`를 교체한다:

```python
class LoginRequest(BaseModel):
    school: str | None = _SCHOOL
    grade: int | None = _GRADE
    class_no: int | None = _CLASS_NO
    student_no: int | None = _STUDENT_NO
    name: str | None = Field(None, min_length=1, max_length=50, description="이름 (개인 참여자만)")
    password: str = _PASSWORD

    @model_validator(mode="after")
    def _exactly_one_identity(self) -> LoginRequest:
        """학교 식별 키 또는 이름 중 정확히 하나로만 로그인한다."""
        has_school = _school_field_state(self.school, self.grade, self.class_no, self.student_no)
        if has_school == (self.name is not None):
            raise ValueError("학교 식별 정보 또는 이름 중 하나만 보내야 합니다.")
        return self
```

- [ ] **Step 6: 라우터에 새 필드 전달**

`app/routers/auth.py`의 `register`에서 `auth.register_student(...)` 호출은 그대로 두고(필드명이 같다), `login` 호출에 `name=req.name`을 추가한다:

```python
    student, token = await auth.login(
        school=req.school,
        grade=req.grade,
        class_no=req.class_no,
        student_no=req.student_no,
        name=req.name,
        password=req.password,
    )
```

- [ ] **Step 7: 라우터 스키마 테스트 추가**

`backend/tests/test_auth_router.py` 아래에 추가:

```python
def test_login_rejects_partial_school_fields(client: TestClient) -> None:
    """학교 필드를 일부만 보내면 422."""
    res = client.post(
        "/api/auth/login",
        json={"school": "대전가양중학교", "grade": 1, "password": "1029"},
    )
    assert res.status_code == 422


def test_login_rejects_both_school_and_name(client: TestClient) -> None:
    """학교 식별 키와 이름을 동시에 보내면 422."""
    res = client.post(
        "/api/auth/login",
        json={
            "school": "대전가양중학교",
            "grade": 1,
            "class_no": 2,
            "student_no": 3,
            "name": "박서준",
            "password": "1029",
        },
    )
    assert res.status_code == 422


def test_login_rejects_neither_school_nor_name(client: TestClient) -> None:
    """식별 정보가 아무것도 없으면 422."""
    res = client.post("/api/auth/login", json={"password": "1029"})
    assert res.status_code == 422
```

`client` fixture 이름은 이 파일의 기존 테스트가 쓰는 것을 그대로 따른다.

- [ ] **Step 8: 테스트 실행**

Run: `cd backend && uv run pytest tests/test_auth_service.py tests/test_auth_router.py -q`
Expected: PASS

- [ ] **Step 9: 품질 게이트 + 커밋**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/app/schemas/auth.py backend/app/services/auth_service.py backend/app/routers/auth.py backend/tests/
git commit -m "feat: 학교 없는 계정의 이름 기반 가입·로그인 추가"
```

---

### Task 4: 관리자 목록에서 테스트 계정 격리

**Files:**
- Modify: `backend/app/repositories/student_repo.py:192-286` (`list_students`, `list_schools`, `get_class_progress`)
- Modify: `backend/app/services/admin_service.py:90-160`
- Modify: `backend/app/routers/admin.py:32-59`
- Modify: `backend/app/schemas/admin.py:37-55` (`AdminStudentItem.kind`)
- Test: `backend/tests/test_admin_service.py`

**Interfaces:**
- Consumes: Task 1 `StudentRecord.kind`
- Produces:
  - `StudentRepository.list_students(..., include_test: bool = False)`
  - `AdminService.list_students(..., include_test: bool = False)`
  - `AdminStudentItem.kind: str`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_admin_service.py` 아래에 추가한다. 이 파일은 `_svc(repo, storage)`로
서비스를 조립하고 `FakeStudentRepo`·`FakeStorage`를 `tests.test_auth_service`에서 가져온다:

```python
async def test_list_students_hides_test_accounts_by_default() -> None:
    """테스트 계정은 기본 목록에 나오지 않고, include_test=True로만 보인다."""
    repo, storage = FakeStudentRepo(), FakeStorage()
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", gender="male", consent_privacy=True,
    )
    await repo.create(
        school="", grade=0, class_no=0, student_no=0,
        name="테스트1", password="x", gender="male",
        consent_privacy=True, kind="test",
    )
    service = _svc(repo, storage)

    default = await service.list_students(
        q=None, school=None, grade=None, class_no=None,
        limit=50, offset=0, include_photo=False,
    )
    assert [i.name for i in default.items] == ["홍길동"]

    with_test = await service.list_students(
        q=None, school=None, grade=None, class_no=None,
        limit=50, offset=0, include_photo=False, include_test=True,
    )
    assert {i.name for i in with_test.items} == {"홍길동", "테스트1"}
    assert {i.kind for i in with_test.items} == {"student", "test"}
```

`FakeStudentRepo.list_students`가 `include_test`를 받도록 함께 고친다 — `kind == "test"`인
레코드를 기본으로 걸러내고, `include_test=True`면 포함한다.

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `cd backend && uv run pytest tests/test_admin_service.py::test_list_students_hides_test_accounts_by_default -v`
Expected: FAIL — `list_students() got an unexpected keyword argument 'include_test'`

- [ ] **Step 3: 저장소 쿼리에 종류 필터 추가**

`app/repositories/student_repo.py`의 `list_students` 시그니처 끝에 `include_test: bool = False`를 추가하고, 조건 초기화를 바꾼다:

```python
        conditions = ["deleted_at is null"]
        if not include_test:
            # 테스트 계정은 실제 데이터가 아니므로 기본 목록·집계에서 제외한다.
            conditions.append("kind <> 'test'")
        params: list[object] = []
```

`list_schools`의 쿼리를 바꾼다:

```python
        query = (
            "select distinct school from pii.students "
            "where deleted_at is null and kind = 'student' order by school"
        )
```

`get_class_progress`의 `where` 절을 바꾼다 (좌석표는 학교·학년·반 구조라 학교 소속만 집계한다):

```python
            where s.school = $1 and s.deleted_at is null and s.kind = 'student'
```

- [ ] **Step 4: 응답 모델에 `kind` 추가**

`app/schemas/admin.py`의 `AdminStudentItem`에 `consent_privacy` 앞에 추가한다:

```python
    kind: str = Field(
        "student", description="계정 종류 ('student' | 'guest' | 'test')"
    )
```

- [ ] **Step 5: 서비스에 인자 전달**

`app/services/admin_service.py`의 `list_students` 시그니처에 `include_test: bool = False`를 추가하고, 저장소 호출에 `include_test=include_test`를 넘긴다. `AdminStudentItem(...)` 조립에 `kind=r.kind`를 추가한다.

- [ ] **Step 6: 라우터에 쿼리 파라미터 추가**

`app/routers/admin.py`의 `list_students`에 파라미터를 추가하고 서비스에 전달한다:

```python
    include_photo: bool = True,
    include_test: bool = False,
) -> AdminStudentList:
```

docstring에 한 줄 덧붙인다:

```
    include_test=true면 관리자 발급 테스트 계정도 함께 보인다(기본은 숨김).
```

- [ ] **Step 7: 테스트 실행**

Run: `cd backend && uv run pytest tests/test_admin_service.py tests/test_admin_router.py -q`
Expected: PASS

- [ ] **Step 8: 품질 게이트 + 커밋**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/app/repositories/student_repo.py backend/app/services/admin_service.py backend/app/routers/admin.py backend/app/schemas/admin.py backend/tests/
git commit -m "feat: 관리자 목록·좌석표에서 테스트 계정 격리"
```

---

### Task 5: 관리자 테스트 계정 발급 · 토큰 · 일괄 삭제

**Files:**
- Modify: `backend/app/schemas/admin.py` (모델 3개 추가)
- Modify: `backend/app/services/admin_service.py` (메서드 3개 추가)
- Modify: `backend/app/routers/admin.py` (엔드포인트 3개 추가)
- Test: `backend/tests/test_admin_service.py`, `backend/tests/test_admin_router.py`

**Interfaces:**
- Consumes: Task 1 `create(kind="test")`, Task 2 `list_by_kind`, 기존 `AdminService.delete_students`
- Produces:
  - `AdminService.create_test_student(*, name: str, gender: str) -> AdminTestStudent`
  - `AdminService.issue_test_student_token(student_id: UUID) -> AdminTestToken`
  - `AdminService.purge_test_students() -> AdminTestPurgeResponse`

- [ ] **Step 1: 응답 모델 추가**

`app/schemas/admin.py` 아래에 추가:

```python
class AdminTestStudentCreateRequest(BaseModel):
    """테스트 계정 발급 요청 — 비밀번호는 받지 않는다(서버가 랜덤으로 채운다)."""

    name: str = Field(..., min_length=1, max_length=50, description="테스트 계정 이름")
    gender: Literal["male", "female"] = Field(..., description="성별 (male=남, female=여)")


class AdminTestStudent(BaseModel):
    """발급된 테스트 계정. 비밀번호는 로그인에 쓰이지 않으므로 내려보내지 않는다."""

    id: UUID
    name: str
    gender: str


class AdminTestToken(BaseModel):
    """테스트 계정으로 학생 화면에 진입하기 위한 학생 세션 토큰."""

    student_id: UUID
    student_token: str = Field(..., description="학생 세션 JWT (Bearer)")


class AdminTestPurgeResponse(BaseModel):
    """테스트 계정 일괄 삭제 결과."""

    deleted: int
    removed_storage_objects: int = 0
```

`Literal` import가 이미 있는지 확인하고 없으면 추가한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_admin_service.py` 아래에 추가:

```python
async def test_create_test_student_generates_random_password() -> None:
    """테스트 계정은 kind='test'로 만들어지고 비밀번호는 서버가 채운다."""
    repo, storage = FakeStudentRepo(), FakeStorage()
    service = _svc(repo, storage)

    created = await service.create_test_student(name="테스트1", gender="male")

    record = await repo.get_by_id(created.id)
    assert record is not None
    assert record.kind == "test"
    assert record.school == ""
    assert len(record.password) >= 16  # 추측 불가능한 랜덤 문자열


async def test_issue_token_only_for_test_accounts() -> None:
    """테스트 계정이 아닌 학생에게는 토큰을 발급하지 않는다."""
    repo, storage = FakeStudentRepo(), FakeStorage()
    student = await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", gender="male", consent_privacy=True,
    )
    service = _svc(repo, storage)

    with pytest.raises(NotFoundError):
        await service.issue_test_student_token(student.id)


async def test_purge_test_students_removes_only_test_accounts() -> None:
    """일괄 삭제는 테스트 계정만 지운다."""
    repo, storage = FakeStudentRepo(), FakeStorage()
    await repo.create(
        school="한마당고", grade=2, class_no=3, student_no=11,
        name="홍길동", password="20100101", gender="male", consent_privacy=True,
    )
    service = _svc(repo, storage)
    await service.create_test_student(name="테스트1", gender="male")
    await service.create_test_student(name="테스트2", gender="female")

    result = await service.purge_test_students()

    assert result.deleted == 2
    assert await repo.list_by_kind("test") == []
    assert await repo.list_by_kind("student") != []
```

`NotFoundError`가 이 파일에 import돼 있지 않으면 `app.core.errors`에서 가져온다.
`FakeStudentRepo`의 `hard_delete`가 이미 있으므로 `purge`는 그대로 동작한다.

- [ ] **Step 3: 테스트를 실행해 실패를 확인**

Run: `cd backend && uv run pytest tests/test_admin_service.py -k "test_student or purge" -v`
Expected: FAIL — `AttributeError: 'AdminService' object has no attribute 'create_test_student'`

- [ ] **Step 4: 서비스 메서드 구현**

`app/services/admin_service.py`의 `delete_students` 아래에 추가한다 (`secrets`·`timedelta`·`TokenKind`·`create_token`은 이미 import돼 있다):

```python
    # 테스트 계정 비밀번호 길이(바이트) — 로그인에 쓰이지 않으므로 사람이 읽을 필요가 없다.
    _TEST_PASSWORD_BYTES = 24

    async def create_test_student(self, *, name: str, gender: str) -> AdminTestStudent:
        """관리자 전용 테스트 계정 발급.

        비밀번호는 랜덤으로 채우고 응답에 담지 않는다. 이 계정은 학생 로그인 화면으로
        진입할 수 없고(AuthService.login이 kind='guest'만 조회한다),
        issue_test_student_token으로 받은 토큰으로만 들어간다.
        """
        record = await self._students.create(
            school="",
            grade=0,
            class_no=0,
            student_no=0,
            name=name,
            password=secrets.token_urlsafe(self._TEST_PASSWORD_BYTES),
            gender=gender,
            consent_privacy=True,
            kind="test",
        )
        return AdminTestStudent(id=record.id, name=record.name, gender=gender)

    async def issue_test_student_token(self, student_id: UUID) -> AdminTestToken:
        """테스트 계정으로 학생 화면에 진입할 학생 세션 토큰 발급.

        대상이 kind='test'가 아니면 NotFoundError — 이 경로로 실제 학생의 토큰을
        발급받아 남의 계정에 들어가는 것을 막는다.
        """
        record = await self._students.get_by_id(student_id)
        if record is None or record.kind != "test":
            raise NotFoundError("테스트 계정을 찾을 수 없습니다.")
        token = create_token(
            kind=TokenKind.STUDENT,
            subject=student_id,
            ttl=timedelta(hours=self._settings.student_token_ttl_hours),
            settings=self._settings,
        )
        return AdminTestToken(student_id=student_id, student_token=token)

    async def purge_test_students(self) -> AdminTestPurgeResponse:
        """테스트 계정 전체를 하드 삭제 — DB cascade + S3 사진·카드 이미지 정리."""
        records = await self._students.list_by_kind("test")
        result = await self.delete_students([r.id for r in records])
        return AdminTestPurgeResponse(
            deleted=len(result.deleted),
            removed_storage_objects=result.removed_storage_objects,
        )
```

`app/schemas/admin` import 목록에 `AdminTestPurgeResponse`, `AdminTestStudent`, `AdminTestToken`을 추가한다.

- [ ] **Step 5: 라우터에 엔드포인트 추가**

`app/routers/admin.py`에서 **`/students/{student_id}`보다 먼저** 선언한다. `bulk_delete_students` 바로 아래(`:81` 부근)에 넣는다:

```python
# 주의: 아래 /students/test 계열은 /students/{student_id}보다 먼저 선언해야 한다.
# (그렇지 않으면 "test"가 UUID 경로 파라미터로 매칭되어 422가 난다.)
@router.post("/students/test", response_model=AdminTestStudent, status_code=201)
async def create_test_student(
    req: AdminTestStudentCreateRequest,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestStudent:
    """테스트 계정 발급 — 관리자 화면에서만 만들 수 있고 학생 로그인 화면엔 노출되지 않는다."""
    return await admin.create_test_student(name=req.name, gender=req.gender)


@router.post("/students/test/{student_id}/token", response_model=AdminTestToken)
async def issue_test_student_token(
    student_id: UUID,
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestToken:
    """테스트 계정으로 학생 화면에 진입할 학생 세션 토큰 발급."""
    return await admin.issue_test_student_token(student_id)


@router.delete("/students/test", response_model=AdminTestPurgeResponse)
async def purge_test_students(
    _admin: CurrentAdminDep,
    admin: AdminServiceDep,
) -> AdminTestPurgeResponse:
    """테스트 계정 전부 삭제 — DB cascade + S3 사진/카드 이미지."""
    return await admin.purge_test_students()
```

`app.schemas.admin` import에 새 모델 4개를 추가한다.

- [ ] **Step 6: 라우터 테스트 추가**

`backend/tests/test_admin_router.py` 아래에 추가:

이 파일은 `_build()`로 앱과 fake를 조립하고 `_admin_token()`으로 헤더를 만든다.
기존 테스트가 `TestClient`를 만드는 방식을 그대로 복사해 쓴다:

```python
def test_test_account_endpoints_require_admin() -> None:
    """관리자 토큰 없이는 테스트 계정 API를 쓸 수 없다."""
    app, *_ = _build()
    with TestClient(app) as client:
        assert client.post(
            "/api/admin/students/test", json={"name": "테스트1", "gender": "male"}
        ).status_code == 401
        assert client.delete("/api/admin/students/test").status_code == 401


def test_delete_students_test_route_precedes_uuid_route() -> None:
    """DELETE /students/test가 /{student_id}로 잡히지 않는다(422가 아니어야 한다)."""
    app, *_ = _build()
    with TestClient(app) as client:
        res = client.delete(
            "/api/admin/students/test",
            headers={"Authorization": f"Bearer {_admin_token()}"},
        )
    assert res.status_code == 200
    assert "deleted" in res.json()
```

`_build()`의 반환 형태(`tuple[object, FakeStudentRepo, FakeStorage, FakeSessionRepo]`)와
`TestClient` 생성 방식은 이 파일의 기존 테스트를 그대로 따른다.

- [ ] **Step 7: 테스트 실행**

Run: `cd backend && uv run pytest tests/test_admin_service.py tests/test_admin_router.py -q`
Expected: PASS

- [ ] **Step 8: 품질 게이트 + 커밋**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/app/schemas/admin.py backend/app/services/admin_service.py backend/app/routers/admin.py backend/tests/
git commit -m "feat: 관리자 테스트 계정 발급·토큰·일괄 삭제 API"
```

---

### Task 6: 테스트 계정은 설문을 반복할 수 있게

**Files:**
- Modify: `backend/app/services/session_service.py:124-170` (`get_profile_summary`), `:212-261` (`complete_survey`), `:263-283` (`_fetch_student_info`)
- Test: `backend/tests/test_session_service.py`

**Interfaces:**
- Consumes: Task 1 `StudentRecord.kind`
- Produces: `SessionService._build_student_info(record: StudentRecord | None) -> StudentInfo | None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_session_service.py` 아래에 추가:

이 파일은 `_build(latest=..., retry=..., student=...)`로 서비스를 조립하고, `_student()`가
학생 레코드를 만든다. 테스트 계정은 `dataclasses.replace`로 `kind`만 바꿔 만든다
(파일 상단 import에 `from dataclasses import replace`를 추가한다):

```python
async def test_test_account_can_complete_survey_when_retry_off() -> None:
    """kind='test' 계정은 전역 retry_enabled가 꺼져 있어도 설문을 다시 완료할 수 있다."""
    student = replace(_student(), kind="test")
    service, _, _ = _build(latest=_session("completed"), retry=False, student=student)

    summary = await service.complete_survey(student.id, None)

    assert summary.has_completed is True


async def test_test_account_profile_reports_retry_enabled() -> None:
    """테스트 계정 프로필은 전역 스위치가 꺼져 있어도 retry_enabled=true로 내려간다."""
    student = replace(_student(), kind="test")
    service, _, _ = _build(latest=None, retry=False, student=student)

    summary = await service.get_profile_summary(student.id)

    assert summary.retry_enabled is True
```

일반 학생이 두 번째 완료에서 409가 나는 것은 기존 테스트
`test_complete_survey_conflict_when_completed_and_retry_off`가 이미 검증하므로 새로 쓰지 않는다.
그 테스트가 계속 통과하는지만 확인한다(회귀 방지).

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `cd backend && uv run pytest tests/test_session_service.py -k "test_account" -v`
Expected: FAIL — 첫 테스트가 `ConflictError: 이미 설문을 완료했습니다.`

- [ ] **Step 3: `_fetch_student_info`를 레코드 기반으로 리팩터**

`app/services/session_service.py`에서 `_fetch_student_info`를 `_build_student_info`로 바꾼다 (레코드를 인자로 받는다 — `kind`를 함께 쓰기 위해 조회를 호출부로 올린다):

```python
    async def _build_student_info(self, student: StudentRecord | None) -> StudentInfo | None:
        """학생 레코드 → 응답 모델. 없으면 None(비밀번호는 노출하지 않음)."""
        if student is None:
            return None
        # 사진이 있으면 카드 이미지와 동일하게 Presigned URL로 내린다.
        photo_url: str | None = None
        if student.photo_key:
            photo_url = await self._storage.create_signed_url(
                student.photo_key,
                ttl_seconds=self._settings.share_link_ttl_hours * 3600,
            )
        return StudentInfo(
            school=student.school,
            grade=student.grade,
            class_no=student.class_no,
            student_no=student.student_no,
            name=student.name,
            gender=student.gender,
            photo_url=photo_url,
        )
```

- [ ] **Step 4: `get_profile_summary`에서 테스트 계정의 재시도를 열기**

`get_profile_summary`의 앞부분을 교체한다:

```python
        record = await self._students.get_by_id(student_id)
        # 테스트 계정은 전역 스위치와 무관하게 항상 다시 할 수 있다 — 그래야 계정 하나로
        # 반복 테스트가 되고, 테스트할 때마다 새 계정을 만들어 DB에 쌓지 않는다.
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY)) or (
            record is not None and record.kind == "test"
        )
        student = await self._build_student_info(record)
        booths = await self._list_booth_statuses(student_id)
```

나머지 본문은 그대로 둔다(`student` 변수명이 같으므로 이후 코드가 바뀌지 않는다).

- [ ] **Step 5: `complete_survey`에서 같은 규칙 적용**

`complete_survey`의 앞부분을 교체한다:

```python
        record = await self._students.get_by_id(student_id)
        latest = await self._sessions.get_latest_completed_for_student(student_id)
        retry_enabled = bool(await self._settings_repo.get(RETRY_ENABLED_KEY)) or (
            record is not None and record.kind == "test"
        )
        if latest is not None and not retry_enabled:
            raise ConflictError("이미 설문을 완료했습니다.")
```

docstring의 "최근 '완료' 세션이 있고 retry_enabled가 false면 409(ConflictError)." 줄 뒤에 한 줄 덧붙인다:

```
        테스트 계정(kind='test')은 전역 스위치와 무관하게 항상 반복할 수 있다.
```

- [ ] **Step 6: 테스트 실행**

Run: `cd backend && uv run pytest tests/test_session_service.py -q`
Expected: PASS

- [ ] **Step 7: 품질 게이트 + 커밋**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
cd ..
git add backend/app/services/session_service.py backend/tests/
git commit -m "feat: 테스트 계정은 설문을 반복할 수 있게"
```

---

### Task 7: 프론트 API 타입과 관리자 호출 추가

**Files:**
- Modify: `frontend/lib/api.ts:12-34` (페이로드 타입), `:73-81` (`ProfileSummary` 주변), 관리자 API 함수 추가
- Test: `frontend/lib/api.test.ts`

**Interfaces:**
- Consumes: Task 3 로그인·가입 계약, Task 5 관리자 엔드포인트
- Produces:
  - `RegisterPayload` · `LoginPayload` (유니온)
  - `createAdminTestStudent(token, body) -> Promise<AdminTestStudent>`
  - `issueAdminTestToken(token, id) -> Promise<AdminTestToken>`
  - `purgeAdminTestStudents(token) -> Promise<AdminTestPurgeResponse>`

- [ ] **Step 1: 페이로드 타입을 유니온으로 교체**

`frontend/lib/api.ts:12-29`를 교체한다:

```ts
// 학교 소속 학생의 식별 키. 개인 참여자는 이 네 필드를 아예 보내지 않는다.
export interface SchoolIdentity {
  school: string;
  grade: number;
  class_no: number;
  student_no: number;
}

// 계정 종류와 무관하게 항상 보내는 항목.
export interface AccountFields {
  name: string;
  password: string;
  gender: "male" | "female";
  consent_privacy: boolean;
}

export type RegisterPayload = AccountFields | (AccountFields & SchoolIdentity);

export type LoginPayload =
  | (SchoolIdentity & { password: string })
  | { name: string; password: string };
```

교차 타입에 `Record<string, never>`를 쓰면 안 된다 — `string & never`가 되어 모든 필드가
`never`로 무너진다. 위처럼 유니온으로 둔다.

- [ ] **Step 2: 관리자 응답 타입과 호출 함수 추가**

`frontend/lib/api.ts`의 관리자 API 함수들 근처(`bulkDeleteAdminStudents` 아래)에 추가한다:

```ts
export interface AdminTestStudent {
  id: string;
  name: string;
  gender: string;
}

export interface AdminTestToken {
  student_id: string;
  student_token: string;
}

export interface AdminTestPurgeResponse {
  deleted: number;
  removed_storage_objects: number;
}

export function createAdminTestStudent(
  token: string,
  body: { name: string; gender: "male" | "female" }
): Promise<AdminTestStudent> {
  return request<AdminTestStudent>("/api/admin/students/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// 테스트 계정으로 학생 화면에 진입할 학생 토큰을 받는다.
// 테스트 계정은 학생 로그인 화면으로 들어갈 수 없으므로 이 경로가 유일한 진입점이다.
export function issueAdminTestToken(
  token: string,
  studentId: string
): Promise<AdminTestToken> {
  return request<AdminTestToken>(
    `/api/admin/students/test/${studentId}/token`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

export function purgeAdminTestStudents(
  token: string
): Promise<AdminTestPurgeResponse> {
  return request<AdminTestPurgeResponse>("/api/admin/students/test", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

- [ ] **Step 3: `AdminStudentItem`에 `kind` 추가**

`frontend/lib/api.ts`의 `AdminStudentItem` 인터페이스에 추가한다:

```ts
  kind: "student" | "guest" | "test";
```

`AdminStudentQuery`에도 추가한다:

```ts
  include_test?: boolean;
```

그리고 `fetchAdminStudents`의 쿼리 조립에 한 줄 추가한다:

```ts
  if (params.include_test != null) sp.set("include_test", String(params.include_test));
```

- [ ] **Step 4: 테스트 추가**

`frontend/lib/api.test.ts` 아래에 추가한다 (이 파일의 기존 `fetch` 모킹 방식을 그대로 따른다):

```ts
it("개인 로그인은 학교 필드 없이 이름만 보낸다", async () => {
  const fetchMock = mockFetchOnce({ student_id: "s1", student_token: "t1" });
  await loginStudent({ name: "박서준", password: "1029" });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(body).toEqual({ name: "박서준", password: "1029" });
  expect(body.school).toBeUndefined();
});
```

- [ ] **Step 5: 테스트 실행**

Run: `cd frontend && npm run test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd frontend && npm run lint && npx tsc --noEmit
cd ..
git add frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat: 개인 참여자·테스트 계정 API 타입과 관리자 호출 추가"
```

---

### Task 8: 학교급 탭 3개 (중학교 · 고등학교 · 개인)

**Files:**
- Modify: `frontend/components/auth/SchoolSelect.tsx:11-57` (level state 제거, prop으로 받기)
- Modify: `frontend/components/auth/IdentityFields.tsx` (탭 소유, 개인 모드 분기)

**Interfaces:**
- Consumes: 없음 (순수 UI)
- Produces:
  - `export type IdentityLevel = "중학교" | "고등학교" | "개인"`
  - `IdentityValues` — `{ level: IdentityLevel; school: string; grade: string; classNo: string; studentNo: string }`
  - `SchoolSelect` props — `{ level: "중학교" | "고등학교"; value: string; onChange: (school: string) => void; disabled?: boolean }`

- [ ] **Step 1: `SchoolSelect`에서 학교급 토글을 걷어내기**

`frontend/components/auth/SchoolSelect.tsx`를 수정한다:

- `LEVELS` 상수와 학교급 토글 JSX(`{/* "학교" 라벨 + 학교급 토글 */}` 블록의 토글 부분), `handleLevelChange`, `deriveLevel`, `const [level, setLevel] = useState...`를 제거한다.
- props에 `level: Level`을 추가하고 내부에서 그대로 쓴다.
- 라벨 줄은 `<span className="text-sm font-bold text-zinc-600">학교</span>`만 남긴다.

```tsx
type Level = "중학교" | "고등학교";

interface SchoolSelectProps {
  /** 상위(IdentityFields)가 소유하는 학교급 */
  level: Level;
  /** 선택된 학교명 (백엔드 식별 키) */
  value: string;
  onChange: (school: string) => void;
  disabled?: boolean;
}

export function SchoolSelect({ level, value, onChange, disabled }: SchoolSelectProps) {
```

`filtered`·`handleFocus`·`handleBlur`·`handleSelect`와 목록 JSX는 그대로 둔다.

- [ ] **Step 2: `IdentityFields`가 탭을 소유하게**

`frontend/components/auth/IdentityFields.tsx`를 교체한다:

```tsx
"use client";

// 회원가입·로그인 공통 식별 입력.
// 학교 소속(중학교/고등학교)은 (school, grade, class_no, student_no)로 식별하고,
// 개인 참여자는 학교 정보 없이 이름 + 비밀번호로 식별한다(백엔드 kind='guest').

import { Input } from "@/components/ui/input";
import { SchoolSelect } from "@/components/auth/SchoolSelect";
import { cn } from "@/lib/utils";

export type IdentityLevel = "중학교" | "고등학교" | "개인";

const LEVELS: IdentityLevel[] = ["중학교", "고등학교", "개인"];

export interface IdentityValues {
  level: IdentityLevel;
  school: string;
  grade: string;
  classNo: string;
  studentNo: string;
}

interface IdentityFieldsProps {
  values: IdentityValues;
  onChange: (field: keyof IdentityValues, value: string) => void;
  disabled?: boolean;
}

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-sky-100";

// 숫자 입력란은 숫자만 허용 (식별 키 학년/반/번호).
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** 학교 정보를 쓰지 않는 참여 유형인지. 백엔드로 학교 4개 필드를 보내지 않는다. */
export function isGuestLevel(level: IdentityLevel): boolean {
  return level === "개인";
}

export function IdentityFields({ values, onChange, disabled }: IdentityFieldsProps) {
  const guest = isGuestLevel(values.level);

  return (
    <div className="space-y-4">
      {/* 참여 유형 탭 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-600">참여 유형</span>
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              disabled={disabled}
              onClick={() => onChange("level", lv)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                values.level === lv
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-200"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {guest ? (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-medium leading-relaxed text-zinc-500">
          학교에 속하지 않은 참가자야. 이름과 비밀번호로 참여할 수 있어.
        </p>
      ) : (
        <>
          <SchoolSelect
            level={values.level}
            value={values.school}
            onChange={(school) => onChange("school", school)}
            disabled={disabled}
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="grade" className={labelClass}>
                학년
              </label>
              <Input
                id="grade"
                value={values.grade}
                onChange={(e) => onChange("grade", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="1"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="classNo" className={labelClass}>
                반
              </label>
              <Input
                id="classNo"
                value={values.classNo}
                onChange={(e) => onChange("classNo", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="2"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="studentNo" className={labelClass}>
                번호
              </label>
              <Input
                id="studentNo"
                value={values.studentNo}
                onChange={(e) => onChange("studentNo", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="3"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

기존 파일의 학년/반/번호 JSX를 그대로 옮기되, 위 구조에 맞춰 `<>...</>` 안에 넣는다. 원본에서 세 입력란의 정확한 마크업을 복사해 쓴다.

- [ ] **Step 3: 두 페이지의 초기값에 `level` 추가 (빌드를 살려두는 최소 변경)**

`IdentityValues`에 `level`이 생겼으므로 이걸 쓰는 두 페이지가 컴파일되지 않는다.
이 커밋도 빌드되도록 초기값만 먼저 넣는다. **실제 모드 분기는 Task 9에서 한다.**

`frontend/app/login/page.tsx`의 `useState<IdentityValues>({` 초기값에 한 줄:

```tsx
    level: "중학교",
```

`frontend/app/signup/page.tsx:25`의 `useState<IdentityValues>({` 초기값에도 같은 한 줄을 넣는다.

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS — 이 시점의 화면은 중학교/고등학교만 동작하고 "개인" 탭을 눌러도
학교 입력란만 사라진다(가입·로그인 제출은 Task 9에서 연결된다).

- [ ] **Step 5: 커밋**

```bash
git add frontend/components/auth/ frontend/app/login/page.tsx frontend/app/signup/page.tsx
git commit -m "feat: 가입·로그인에 참여 유형 탭(중학교·고등학교·개인) 추가"
```

---

### Task 9: 로그인 · 가입 페이지의 개인 모드 분기

**Files:**
- Modify: `frontend/app/login/page.tsx:36-42` (state), `:47-90` (검증·호출), 폼에 이름 입력 추가
- Modify: `frontend/app/signup/page.tsx` (state 초기값, 검증, 호출)

**Interfaces:**
- Consumes: Task 7 `LoginPayload`·`RegisterPayload`, Task 8 `IdentityValues.level`·`isGuestLevel`
- Produces: 없음 (화면 종단)

- [ ] **Step 1: 로그인 페이지 state에 `level` 추가하고 이름 입력란 넣기**

`frontend/app/login/page.tsx`:

import에 `isGuestLevel`을 추가하고(초기값의 `level`은 Task 8 Step 3에서 이미 들어가 있다),
개인 모드에서 쓸 이름 state를 추가한다:

```tsx
import { IdentityFields, isGuestLevel, type IdentityValues } from "@/components/auth/IdentityFields";

// ... 기존 identity useState 아래에 추가
  const [name, setName] = useState("");
```

`<IdentityFields ... />` 바로 아래, 비밀번호 입력란 위에 개인 모드에서만 보이는 이름 입력을 넣는다:

```tsx
            {isGuestLevel(identity.level) && (
              <div>
                <label htmlFor="name" className={labelClass}>
                  이름
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="가입할 때 적었던 이름"
                  disabled={loading}
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
            )}
```

- [ ] **Step 2: 로그인 검증·호출 분기**

`handleSubmit`의 검증 블록과 호출부를 교체한다:

```tsx
    const guest = isGuestLevel(identity.level);

    if (guest) {
      if (!name.trim() || !password) {
        setError("이름과 비밀번호를 입력해줘.");
        return;
      }
    } else if (
      !identity.school.trim() ||
      !identity.grade ||
      !identity.classNo ||
      !identity.studentNo ||
      !password
    ) {
      setError("모든 항목을 입력해줘.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginStudent(
        guest
          ? { name: name.trim(), password }
          : {
              school: identity.school.trim(),
              grade: Number(identity.grade),
              class_no: Number(identity.classNo),
              student_no: Number(identity.studentNo),
              password,
            }
      );
```

이후 `setAuth(...)`부터의 흐름은 그대로 둔다.

401 에러 메시지도 개인 모드에서 맞게 바꾼다:

```tsx
      if (err instanceof ApiError && err.status === 401) {
        setError(
          guest
            ? "이름 또는 비밀번호가 올바르지 않아요."
            : "학번 또는 비밀번호가 올바르지 않아요."
        );
      }
```

`guest`가 `catch` 블록에서 보이도록 `handleSubmit` 최상단(`setError(null)` 근처)에서 선언한다.

- [ ] **Step 3: 가입 페이지 분기**

`frontend/app/signup/page.tsx`:

- import를 바꾼다: `import { IdentityFields, isGuestLevel, type IdentityValues } from "@/components/auth/IdentityFields";`
- `identity` 초기값의 `level`은 Task 8 Step 3에서 이미 넣었다 — 다시 넣지 않는다.
- `handleSubmit`의 검증부(`:57-89`)를 교체한다. 개인 모드에서는 `grade`·`classNo`·`studentNo`가
  `NaN`이므로 학교 관련 검사를 통째로 건너뛰어야 한다:

```tsx
    // 기본 입력 검증 (백엔드도 검증하지만 사용자 경험상 먼저 막아준다)
    const guest = isGuestLevel(identity.level);
    const grade = Number(identity.grade);
    const classNo = Number(identity.classNo);
    const studentNo = Number(identity.studentNo);

    const schoolFieldsMissing =
      !identity.school.trim() ||
      !identity.grade ||
      !identity.classNo ||
      !identity.studentNo;

    if ((!guest && schoolFieldsMissing) || !name.trim() || !gender || !password || !confirmPassword) {
      setError("모든 항목을 입력해줘.");
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      setError("비밀번호는 숫자 4자리로 정해줘.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 서로 달라. 다시 확인해줘.");
      return;
    }
    if (!guest && (grade < 1 || grade > 12)) {
      setError("학년은 1~12 사이로 입력해줘.");
      return;
    }
    if (!guest && (classNo < 1 || classNo > 99 || studentNo < 1 || studentNo > 99)) {
      setError("반과 번호는 1~99 사이로 입력해줘.");
      return;
    }
    if (!consent) {
      setError("개인정보 수집 및 이용에 동의해줘.");
      scrollToConsent();
      return;
    }
```

- `registerStudent(...)` 호출(`:97-106`)을 분기한다:

```tsx
      const res = await registerStudent(
        guest
          ? { name: name.trim(), password, gender, consent_privacy: consent }
          : {
              school: identity.school.trim(),
              grade,
              class_no: classNo,
              student_no: studentNo,
              name: name.trim(),
              password,
              gender,
              consent_privacy: consent,
            }
      );
```

- 가입 후 프로필용으로 보관하는 `setStudentInfo(...)`(`:110-117`)도 분기한다.
  개인 참여자는 학교가 없으므로 빈 문자열·0으로 채운다(백엔드 저장값과 같게 맞춘다):

```tsx
      setStudentInfo({
        school: guest ? "" : identity.school.trim(),
        grade: guest ? 0 : grade,
        classNo: guest ? 0 : classNo,
        studentNo: guest ? 0 : studentNo,
        name: name.trim(),
        gender,
      });
```

- 409 처리는 그대로 둔다. 개인 참여자의 이름 중복도 409로 오므로 "이미 등록되어 있어요.
  로그인해주세요." 안내가 그대로 맞는다.

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/app/login/page.tsx frontend/app/signup/page.tsx
git commit -m "feat: 개인 참여자 가입·로그인 화면 분기"
```

---

### Task 10: 프로필 표시 + 관리자 발급 UI

**Files:**
- Modify: `frontend/app/(tabs)/profile/[id]/page.tsx:280-283`
- Modify: `frontend/app/admin/page.tsx`
- Modify: `frontend/components/admin/StudentDetailSidebar.tsx` (상세의 학교 표시)

**Interfaces:**
- Consumes: Task 7 `createAdminTestStudent`·`issueAdminTestToken`·`purgeAdminTestStudents`, `AdminStudentItem.kind`
- Produces: 없음 (화면 종단)

- [ ] **Step 1: 프로필에서 학교 없는 계정 표시**

`frontend/app/(tabs)/profile/[id]/page.tsx:280-283`의 식별 정보 출력을 바꾼다.
학교가 빈 문자열이면 학년·반·번호가 전부 0이므로 그대로 찍으면 `· 0학년 0반 0번`이 된다:

```tsx
                    {displayStudent.school
                      ? `${displayStudent.school} · ${displayStudent.grade}학년 ${displayStudent.classNo}반 ${displayStudent.studentNo}번`
                      : "개인 참여자"}{" "}
                    ·{" "}
```

원본의 JSX 구조(뒤에 이어지는 요소)를 유지하도록 앞부분만 교체한다.

- [ ] **Step 2: 관리자 화면에 발급·정리 버튼 추가**

`frontend/app/admin/page.tsx`에 상태와 핸들러를 추가한다. 관리자 토큰은 이 페이지가 이미 쓰는 방식(`getAdminToken()`)을 그대로 따른다:

```tsx
const [testName, setTestName] = useState("");
const [issuing, setIssuing] = useState(false);

async function handleCreateTestStudent() {
  const token = getAdminToken();
  if (!token || !testName.trim()) return;
  setIssuing(true);
  try {
    await createAdminTestStudent(token, { name: testName.trim(), gender: "male" });
    setTestName("");
    await reload(); // 이 페이지가 목록을 다시 불러오는 기존 함수 이름을 쓴다
  } finally {
    setIssuing(false);
  }
}

async function handlePurgeTestStudents() {
  const token = getAdminToken();
  if (!token) return;
  if (!confirm("테스트 계정을 전부 삭제할까요? 사진·카드 이미지도 함께 지워집니다.")) return;
  await purgeAdminTestStudents(token);
  await reload();
}
```

- [ ] **Step 3: "이 계정으로 테스트 시작" 버튼**

목록의 각 행에서 `item.kind === "test"`일 때만 보이는 버튼을 넣는다:

```tsx
async function handleStartAsTestStudent(studentId: string) {
  const token = getAdminToken();
  if (!token) return;
  const { student_token } = await issueAdminTestToken(token, studentId);
  // 관리자 화면과 학생 화면이 같은 앱이라 Zustand store를 그대로 공유한다.
  useSessionStore.getState().setAuth(student_token, studentId);
  router.push(`/profile/${studentId}`);
}
```

import에 `useSessionStore`(`@/store/useSessionStore`)와 `useRouter`를 추가한다(이미 있으면 생략).

- [ ] **Step 4: 목록에 테스트 계정을 보이게 + 배지**

목록 조회 호출에 `include_test: true`를 넘긴다(관리자는 테스트 계정을 봐야 관리할 수 있다). 학교 칸은 `kind`에 따라 대체한다:

```tsx
{item.kind === "test"
  ? "테스트"
  : item.kind === "guest"
    ? "개인"
    : item.school}
```

- [ ] **Step 5: 관리자 상세에서도 같은 표시 규칙 적용**

`frontend/components/admin/StudentDetailSidebar.tsx`에서 학교·학년·반·번호를 출력하는 곳을 찾는다:

Run: `cd frontend && grep -n "school\|grade\|classNo\|class_no" components/admin/StudentDetailSidebar.tsx`

학교가 빈 문자열이면 `개인 참여자`(또는 `kind === "test"`면 `테스트 계정`)로 대체한다.
Step 1의 프로필과 같은 조건식을 쓴다 — 두 화면의 규칙이 어긋나면 같은 학생이 다르게 보인다.

- [ ] **Step 6: 타입 체크 + 빌드**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add frontend/app/\(tabs\)/profile frontend/app/admin frontend/components/admin
git commit -m "feat: 관리자 화면 테스트 계정 발급·진입 UI와 개인 참여자 프로필 표시"
```

---

## 배포 전 확인

- [ ] **1. 백엔드 전체 게이트**

```bash
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest -q
```

- [ ] **2. 프론트 전체 게이트**

```bash
cd frontend
npm run lint && npm run test && npm run build
```

- [ ] **3. 마이그레이션을 Supabase에 먼저 적용**

CI·CD는 마이그레이션을 자동 적용하지 않는다(`DEPLOYMENT.md:126`). Supabase SQL Editor에서
`backend/supabase/migrations/0009_add_students_kind.sql` 내용을 그대로 실행한다.

적용 확인:

```sql
select kind, count(*) from pii.students group by kind;
-- 기존 행이 전부 kind='student'로 백필됐는지 확인
select indexname from pg_indexes where schemaname = 'pii' and tablename = 'students';
-- students_login_key, students_name_key 둘 다 있어야 한다
```

- [ ] **4. PR 생성**

base는 `production`. 본문은 `## 개요` + `## 변경 내용` 구성으로 쓰고,
**마이그레이션을 먼저 적용해야 한다는 점**과 `backend/**` 변경이므로 머지 시
자동 재배포된다는 점을 명시한다.

- [ ] **5. 머지 후 헬스체크**

```bash
curl -s https://api.cnu-likelion.kr/healthz
```

- [ ] **6. 수동 확인**

관리자 화면에서 테스트 계정을 발급하고 "이 계정으로 테스트 시작"으로 들어가 설문을
**두 번** 완료해 본다(두 번째에 409가 나지 않아야 한다). 그 뒤 일괄 삭제로 정리한다.
