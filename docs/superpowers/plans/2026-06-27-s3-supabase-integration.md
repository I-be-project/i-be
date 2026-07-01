# S3 스토리지 + Supabase DB 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 FastAPI 백엔드의 이미지 저장을 단일 비공개 S3 버킷(`uploads`/`ai-images`/`cards` 프리픽스)으로 구현하고, DB를 Supabase 직접 연결로 붙인다.

**Architecture:** `StorageClient` 어댑터(현재 스텁)를 `aioboto3` 기반 S3 구현으로 교체한다. 단일 버킷에 프리픽스 3개로 분리 저장하고, 외부 노출은 Presigned GET URL로만 한다. 테스트는 주입 가능한 S3 클라이언트 팩토리(seam)에 가짜 클라이언트를 넣어 **오프라인**으로 검증한다(실제 AWS 호출 없음 — 기존 `ai_client` 테스트가 httpx MockTransport를 쓰는 방식과 동일 철학). DB는 코드 변경 없이 `DATABASE_URL` 값만 Supabase 직접 연결로 바꾼다.

**Tech Stack:** Python 3.12, FastAPI, asyncpg, `aioboto3`(신규), pydantic-settings, pytest(`asyncio_mode=auto`), ruff, mypy, uv.

## Global Constraints

- Python: `requires-python = ">=3.12"`. `aioboto3>=15.0.0` 추가(py≥3.9 호환).
- 단일 S3 버킷 + 프리픽스: `uploads` / `ai-images` / `cards`. 버킷명·자격증명은 코드에 하드코딩 금지(전부 `Settings` 경유).
- 업로드 객체는 항상 `ServerSideEncryption="AES256"` + 정확한 `ContentType` 지정.
- 외부 노출은 **Presigned GET URL만**. 퍼블릭 URL 생성 금지.
- 사진 3종(`uploads`/`ai-images`/`cards`) 모두 **영구 보관**. 자동 폐기(delete) 경로를 만들지 않는다. `delete()`는 명시적 삭제 요청 전용으로만 존재.
- 모든 테스트는 실제 AWS/네트워크 호출 없이 통과해야 한다(가짜 S3 클라이언트 주입).
- 기존 스타일 준수: `from __future__ import annotations`, 한글 docstring, ruff 라인 길이 100.
- 커밋 단위는 작게, 각 태스크 끝에서 `ruff`·`mypy`·해당 테스트 통과 후 커밋. git 작업 디렉터리는 `backend/`(`.git`이 `backend/`에 있음).

---

## File Structure

- `backend/pyproject.toml` — `aioboto3` 의존성 추가 (Modify)
- `backend/app/config.py` — `Settings`에 S3 필드 추가, `storage_bucket_*` 제거 (Modify)
- `backend/app/adapters/storage_client.py` — Supabase 스텁 → S3 어댑터 재구현 (Rewrite)
- `backend/tests/test_storage_client.py` — S3 어댑터 단위 테스트, 가짜 클라이언트 (Create)
- `backend/tests/test_config_s3.py` — Settings S3 필드 로드 테스트 (Create)
- `backend/.env.example` — AWS/S3 변수 추가, Supabase Storage 변수 정리, DB 직접연결 안내 (Modify)
- `backend/.env` — 운영자가 실제 값 채움(코드 작업 아님, 태스크 3 안내)

`app/deps.py`는 시그니처 변화 없음(`StorageClient.from_settings(settings)` 그대로) — 변경 불필요.

---

### Task 1: 의존성 + S3 설정(`Settings`)

기존 `Settings`의 Supabase Storage용 버킷 필드를 S3 프리픽스/자격증명 필드로 교체하고, `aioboto3`를 추가한다.

**Files:**
- Modify: `backend/pyproject.toml` (dependencies)
- Modify: `backend/app/config.py:38-42` (Storage 섹션)
- Test: `backend/tests/test_config_s3.py`

**Interfaces:**
- Consumes: 없음
- Produces: `Settings`에 다음 필드 — `s3_region: str`, `s3_bucket: str`, `aws_access_key_id: str`, `aws_secret_access_key: str`, `storage_prefix_uploads: str`(기본 `"uploads"`), `storage_prefix_ai_images: str`(기본 `"ai-images"`), `storage_prefix_cards: str`(기본 `"cards"`). `supabase_url`/`supabase_service_key`는 유지(DB·Auth 맥락).

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_config_s3.py` 생성:

```python
"""Settings의 S3 필드가 환경변수에서 로드되는지 검증."""

from __future__ import annotations

from app.config import Settings


def test_settings_loads_s3_fields(monkeypatch):
    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setenv("S3_REGION", "ap-northeast-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIATEST")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secretvalue")

    s = Settings()

    assert s.s3_bucket == "my-bucket"
    assert s.s3_region == "ap-northeast-2"
    assert s.aws_access_key_id == "AKIATEST"
    assert s.aws_secret_access_key == "secretvalue"
    # 프리픽스 기본값
    assert s.storage_prefix_uploads == "uploads"
    assert s.storage_prefix_ai_images == "ai-images"
    assert s.storage_prefix_cards == "cards"
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && uv run pytest tests/test_config_s3.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 's3_bucket'`

- [ ] **Step 3: `config.py` 수정**

`backend/app/config.py`에서 기존 Storage 블록(38–42행)을 찾아:

```python
    # Storage (Supabase)
    supabase_url: str = ""
    supabase_service_key: str = ""
    storage_bucket_photos: str = "photos"
    storage_bucket_cards: str = "cards"
```

다음으로 교체:

```python
    # Supabase (DB·Auth 맥락에서만 사용; 스토리지는 S3로 이전)
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Storage (S3 단일 비공개 버킷 + 프리픽스)
    s3_region: str = "ap-northeast-2"
    s3_bucket: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    storage_prefix_uploads: str = "uploads"
    storage_prefix_ai_images: str = "ai-images"
    storage_prefix_cards: str = "cards"
```

- [ ] **Step 4: `aioboto3` 의존성 추가**

`backend/pyproject.toml`의 `dependencies` 리스트에 한 줄 추가(알파벳 순서상 `asyncpg` 위):

```toml
    "aioboto3>=15.0.0",
    "asyncpg>=0.31.0",
```

그다음 잠금파일 갱신:

Run: `cd backend && uv lock`
Expected: `uv.lock` 갱신, 에러 없음.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_config_s3.py -v`
Expected: PASS

- [ ] **Step 6: 린트·타입체크**

Run: `cd backend && uv run ruff check app/config.py tests/test_config_s3.py && uv run mypy app/config.py`
Expected: 통과(에러 없음).

- [ ] **Step 7: 커밋**

```bash
cd backend
git add pyproject.toml uv.lock app/config.py tests/test_config_s3.py
git commit -m "feat(config): S3 스토리지 설정 추가, aioboto3 의존성"
```

---

### Task 2: S3 `StorageClient` 구현

스텁 `StorageClient`를 `aioboto3` 기반 S3 어댑터로 재구현한다. 테스트는 주입 가능한 클라이언트 팩토리에 가짜 S3를 넣어 오프라인 검증.

**Files:**
- Rewrite: `backend/app/adapters/storage_client.py`
- Test: `backend/tests/test_storage_client.py`

**Interfaces:**
- Consumes: `Settings`의 `s3_bucket`, `s3_region`, `aws_access_key_id`, `aws_secret_access_key`, `storage_prefix_uploads`, `storage_prefix_ai_images`, `storage_prefix_cards` (Task 1).
- Produces: `StorageClient` — 메서드 시그니처:
  - `upload_photo(path: str, data: bytes, *, content_type: str) -> str` (→ `uploads/{path}` 전체 키 반환)
  - `upload_generated_image(path: str, data: bytes, *, content_type: str) -> str` (→ `ai-images/{path}`)
  - `upload_card_image(path: str, data: bytes, *, content_type: str) -> str` (→ `cards/{path}`)
  - `create_signed_url(key: str, *, ttl_seconds: int) -> str`
  - `delete(key: str) -> None`
  - 생성자 keyword `client_factory: S3ClientFactory | None = None` (테스트 seam). `from_settings(settings) -> StorageClient`.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_storage_client.py` 생성:

```python
"""S3 StorageClient 단위 테스트 (가짜 S3 클라이언트, 실제 AWS 호출 없음)."""

from __future__ import annotations

from app.adapters.storage_client import StorageClient


class _FakeS3:
    """aioboto3 s3 client를 흉내내는 async context manager."""

    def __init__(self) -> None:
        self.put_calls: list[dict] = []
        self.delete_calls: list[dict] = []
        self.sign_calls: list[tuple[str, dict]] = []

    async def __aenter__(self) -> "_FakeS3":
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    async def put_object(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)

    async def delete_object(self, **kwargs: object) -> None:
        self.delete_calls.append(kwargs)

    async def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        self.sign_calls.append((operation, kwargs))
        return "https://signed.example/get"


def _make(fake: _FakeS3) -> StorageClient:
    return StorageClient(
        bucket="test-bucket",
        region="ap-northeast-2",
        access_key_id="AKIATEST",
        secret_access_key="secretvalue",
        prefix_uploads="uploads",
        prefix_ai_images="ai-images",
        prefix_cards="cards",
        client_factory=lambda: fake,
    )


async def test_upload_photo_uses_uploads_prefix_and_returns_key():
    fake = _FakeS3()
    client = _make(fake)

    key = await client.upload_photo("stud-1/a.jpg", b"bytes", content_type="image/jpeg")

    assert key == "uploads/stud-1/a.jpg"
    assert fake.put_calls[0]["Bucket"] == "test-bucket"
    assert fake.put_calls[0]["Key"] == "uploads/stud-1/a.jpg"
    assert fake.put_calls[0]["Body"] == b"bytes"
    assert fake.put_calls[0]["ContentType"] == "image/jpeg"
    assert fake.put_calls[0]["ServerSideEncryption"] == "AES256"


async def test_upload_generated_image_uses_ai_images_prefix():
    fake = _FakeS3()
    key = await _make(fake).upload_generated_image("card-1/p.png", b"x", content_type="image/png")
    assert key == "ai-images/card-1/p.png"
    assert fake.put_calls[0]["Key"] == "ai-images/card-1/p.png"


async def test_upload_card_image_uses_cards_prefix():
    fake = _FakeS3()
    key = await _make(fake).upload_card_image("card-1/c.png", b"x", content_type="image/png")
    assert key == "cards/card-1/c.png"
    assert fake.put_calls[0]["Key"] == "cards/card-1/c.png"


async def test_create_signed_url_passes_key_and_ttl():
    fake = _FakeS3()
    url = await _make(fake).create_signed_url("cards/card-1/c.png", ttl_seconds=3600)
    assert url == "https://signed.example/get"
    op, kwargs = fake.sign_calls[0]
    assert op == "get_object"
    assert kwargs["Params"] == {"Bucket": "test-bucket", "Key": "cards/card-1/c.png"}
    assert kwargs["ExpiresIn"] == 3600


async def test_delete_calls_delete_object_with_key():
    fake = _FakeS3()
    await _make(fake).delete("uploads/stud-1/a.jpg")
    assert fake.delete_calls[0] == {"Bucket": "test-bucket", "Key": "uploads/stud-1/a.jpg"}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: FAIL — 생성자가 `client_factory`/프리픽스 keyword를 모름(현재 스텁 시그니처) → `TypeError`.

- [ ] **Step 3: S3 어댑터 구현**

`backend/app/adapters/storage_client.py` 전체를 다음으로 교체:

```python
"""S3 스토리지 어댑터.

단일 비공개 버킷에 3개 프리픽스(uploads/ai-images/cards)로 저장하고,
외부 노출은 Presigned GET URL로만 한다. 바이너리는 S3에, DB엔 키만 보관.
업로드는 항상 SSE(AES256) + ContentType 지정. delete는 명시적 삭제 요청 전용.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any

import aioboto3

from app.config import Settings

# 호출마다 S3 클라이언트(async context manager)를 새로 만드는 팩토리.
# 테스트에서 가짜 클라이언트를 주입하기 위한 seam.
S3ClientFactory = Callable[[], AbstractAsyncContextManager[Any]]


class StorageClient:
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        prefix_uploads: str,
        prefix_ai_images: str,
        prefix_cards: str,
        client_factory: S3ClientFactory | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._prefix_uploads = prefix_uploads
        self._prefix_ai_images = prefix_ai_images
        self._prefix_cards = prefix_cards
        self._client_factory = client_factory or self._default_client

    @classmethod
    def from_settings(cls, settings: Settings) -> StorageClient:
        return cls(
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            access_key_id=settings.aws_access_key_id,
            secret_access_key=settings.aws_secret_access_key,
            prefix_uploads=settings.storage_prefix_uploads,
            prefix_ai_images=settings.storage_prefix_ai_images,
            prefix_cards=settings.storage_prefix_cards,
        )

    def _default_client(self) -> AbstractAsyncContextManager[Any]:
        session = aioboto3.Session(
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            region_name=self._region,
        )
        return session.client("s3")

    async def _put(self, key: str, data: bytes, *, content_type: str) -> str:
        async with self._client_factory() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        return key

    async def upload_photo(self, path: str, data: bytes, *, content_type: str) -> str:
        """학생 원본 사진 업로드(uploads/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_uploads}/{path}", data, content_type=content_type)

    async def upload_generated_image(self, path: str, data: bytes, *, content_type: str) -> str:
        """AI 생성 인물 이미지 업로드(ai-images/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_ai_images}/{path}", data, content_type=content_type)

    async def upload_card_image(self, path: str, data: bytes, *, content_type: str) -> str:
        """최종 카드 이미지 업로드(cards/). 전체 S3 키 반환."""
        return await self._put(f"{self._prefix_cards}/{path}", data, content_type=content_type)

    async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
        """key에 대한 Presigned GET URL 발급."""
        async with self._client_factory() as s3:
            return await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=ttl_seconds,
            )

    async def delete(self, key: str) -> None:
        """객체 삭제. 명시적 삭제 요청 전용(자동 폐기 아님)."""
        async with self._client_factory() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=key)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_storage_client.py -v`
Expected: PASS (5개 모두)

- [ ] **Step 5: 린트·타입체크**

Run: `cd backend && uv run ruff check app/adapters/storage_client.py tests/test_storage_client.py && uv run mypy app/adapters/storage_client.py`
Expected: 통과.

- [ ] **Step 6: 전체 테스트 회귀 확인**

Run: `cd backend && uv run pytest -q`
Expected: PASS (기존 테스트 깨짐 없음).

- [ ] **Step 7: 커밋**

```bash
cd backend
git add app/adapters/storage_client.py tests/test_storage_client.py
git commit -m "feat(storage): S3 어댑터 구현 (uploads/ai-images/cards, presigned URL)"
```

---

### Task 3: 환경변수 / 인프라 배선 (DB 직접연결 + S3 자격증명)

코드가 아니라 운영 설정 적용. `.env.example` 갱신, 실제 `.env` 값 채움, Supabase 직접연결·S3 버킷·IAM 셋업 및 스모크 검증.

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/.env` (운영자가 실제 값 입력, git 미커밋)

**Interfaces:**
- Consumes: Task 1의 `Settings` 필드명(`S3_BUCKET`/`S3_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` 등), Task 2의 `StorageClient`.
- Produces: 실행 가능한 운영 설정(코드 산출물 아님).

- [ ] **Step 1: `.env.example`의 Storage 섹션 교체**

`backend/.env.example`에서 기존 블록:

```env
# ─── Storage (Supabase) ───────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
STORAGE_BUCKET_PHOTOS=photos
STORAGE_BUCKET_CARDS=cards
```

다음으로 교체:

```env
# ─── Storage (AWS S3, 단일 비공개 버킷) ───────────
# 버킷은 "모든 퍼블릭 액세스 차단" 활성화. 외부 노출은 Presigned URL만.
S3_REGION=ap-northeast-2
S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# 프리픽스(폴더). 기본값 그대로 두면 됨.
STORAGE_PREFIX_UPLOADS=uploads
STORAGE_PREFIX_AI_IMAGES=ai-images
STORAGE_PREFIX_CARDS=cards

# Supabase (DB·Auth 맥락에서만 사용; 스토리지는 S3로 이전)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

- [ ] **Step 2: `.env.example`의 DB 안내 갱신**

`backend/.env.example`의 DB 섹션 `DATABASE_URL` 줄을 Supabase 직접연결 형식 주석으로 보강:

```env
# ─── DB ───────────────────────────────────────────
DATABASE_ENABLED=true
# Supabase 직접 연결(Direct connection, 포트 5432). 트랜잭션 풀러(:6543) 사용 금지.
# postgresql://postgres:<DB_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

- [ ] **Step 3: `.env.example` 검증 커밋**

```bash
cd backend
git add .env.example
git commit -m "docs(env): S3 변수 추가 및 Supabase 직접연결 안내"
```

- [ ] **Step 4: 실제 `.env` 값 입력 (운영자 수행, 커밋 금지)**

`backend/.env`에서:
- `DATABASE_URL`을 Supabase 직접연결 문자열로 교체(프로젝트 ref `ohsamobxhxlycnjrxkbb`, `<DB_PASSWORD>`는 실제 비밀번호. 특수문자는 URL 인코딩).
- `S3_BUCKET` = 생성한 버킷명, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` = IAM 사용자 키.
- 확인: `git status`에 `.env`가 **나타나지 않아야** 함(`.gitignore` 처리됨).

Run: `cd backend && git status --porcelain | grep -F ".env" | grep -v ".env.example" || echo "OK: .env not tracked"`
Expected: `OK: .env not tracked`

- [ ] **Step 5: 인프라 사전 셋업 확인 (콘솔)**

설계 §6 기준 — 다음이 완료되어 있어야 함:
- S3: 단일 버킷(`ap-northeast-2`), "모든 퍼블릭 액세스 차단" 활성화.
- IAM: 우리 버킷의 `s3:PutObject`/`s3:GetObject`/`s3:DeleteObject`만 허용하는 정책 부착 + 액세스 키 발급.
- Supabase: 스키마 마이그레이션 반영(`supabase db push` 또는 SQL 에디터).

- [ ] **Step 6: S3 왕복 스모크 (실 자격증명, 수동)**

`backend/.env`에 실제 값이 있는 상태에서:

```bash
cd backend && uv run python -c "
import asyncio
from app.config import Settings
from app.adapters.storage_client import StorageClient

async def main():
    c = StorageClient.from_settings(Settings())
    key = await c.upload_card_image('smoke/test.txt', b'hello', content_type='text/plain')
    url = await c.create_signed_url(key, ttl_seconds=60)
    print('PUT key =', key)
    print('signed url =', url[:80], '...')
    await c.delete(key)
    print('deleted OK')

asyncio.run(main())
"
```

Expected: `PUT key = cards/smoke/test.txt`, presigned URL 출력, `deleted OK`. (실패 시 IAM 권한/버킷명/리전 점검 — 설계 §8 보안 체크리스트)

- [ ] **Step 7: DB 연결 스모크 (실 자격증명, 수동)**

```bash
cd backend && uv run python -c "
import asyncio
from app.config import Settings
from app.adapters.db_pool import DBPool

async def main():
    pool = DBPool(Settings().database_url)
    await pool.connect(min_size=1, max_size=2)
    async with pool.acquire() as conn:
        print('db ok:', await conn.fetchval('select 1'))
    await pool.disconnect()

asyncio.run(main())
"
```

Expected: `db ok: 1`. (실패 시: IPv6 경로면 Session 풀러로 폴백, 트랜잭션 풀러 `:6543`는 금지 — 설계/배포문서 참조)

---

## Self-Review

**1. Spec coverage:**
- 설계 §3 저장구조(단일버킷 3프리픽스) → Task 2 메서드별 프리픽스. ✅
- §4 흐름(받기/생성/전달) → `upload_photo`/`upload_generated_image`/`upload_card_image`/`create_signed_url`. ✅
- §5.1 어댑터(`upload_generated_image` 신규 포함) → Task 2. ✅
- §5.2 Settings → Task 1. ✅
- §5.3 deps → 시그니처 불변이라 변경 불필요(File Structure에 명시). ✅
- §5.4 .env → Task 3. ✅
- §5.5 pyproject aioboto3 → Task 1. ✅
- §5.6 DB 직접연결(코드 변경 없음) → Task 3 Step 4·7. ✅
- §6 인프라(S3/IAM/Supabase) → Task 3 Step 5. ✅
- §7 테스트(어댑터 단위 + DB 스모크) → Task 2 단위테스트, Task 3 Step 6·7. ✅
- §8 보안 체크리스트 → Task 3 인프라/스모크 단계에서 참조. ✅
- 사진 영구보관(자동 폐기 없음) → `delete()`는 명시적 삭제 전용으로만 존재, 업로드 경로에 delete 호출 없음. ✅

**2. Placeholder scan:** 모든 코드 단계에 실제 코드 포함. `<DB_PASSWORD>`/`<project-ref>`는 운영자 입력값(의도된 자리표시자, Step 4에서 설명). 통과.

**3. Type consistency:** `StorageClient` 메서드명·시그니처가 Task 2 Interfaces·구현·테스트에서 일치(`upload_photo`/`upload_generated_image`/`upload_card_image`/`create_signed_url(key, *, ttl_seconds)`/`delete(key)`). Settings 필드명이 Task 1·Task 2 `from_settings`·Task 3 env에서 일치(`s3_bucket`/`S3_BUCKET` 등). 통과.
