# 페르소나 카드 이미지 생성 파이프라인 (dev) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dev 환경에서 mock 페르소나를 입력받아 AI 이미지 프롬프트 생성 → 인물(얼굴 입력)·배경 이미지 생성 → 카드 합성까지 엔드투엔드로 동작시킨다.

**Architecture:** 백엔드는 재사용 가능한 함수형 서비스 레이어(`ai_service.generate_image_prompts` → `persona_pipeline.generate_card`)로 만들고, 얇은 dev 엔드포인트(`POST /api/dev/persona-card`)로 노출한다. 프론트는 `/dev/flow`에서 mock Q&A를 버튼 전환으로 보여주고 마지막에 백엔드를 호출해 완성 카드를 표시한다. 저장(DB/Storage)은 이번 범위 밖.

**Tech Stack:** Python 3.12 · FastAPI · httpx · Pillow · pytest(asyncio_mode=auto) / Next.js 16 · TypeScript · Framer Motion · Zustand

## Global Constraints

- 백엔드 라인 길이 100 (`ruff`, line-length=100), target `py312`
- 테스트는 `uv run pytest`, `asyncio_mode = "auto"` (async 테스트에 `@pytest.mark.asyncio` 불필요)
- 외부 호출 테스트는 **실제 API 금지** — `httpx.MockTransport` 또는 stub 객체 사용
- 도메인 실패는 `app.core.errors.ExternalServiceError(message, *, details=...)` 사용 (status 502)
- AI 호출은 purpose 기반: `AIClient.chat(AIPurpose.X, ...)`, `AIClient.generate_image(AIPurpose.X, ...)`
- 이미지 bytes는 반드시 `app.core.images.inspect_image`로 검증된 것만 신뢰
- 프론트 API base URL: `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"` (기존 `/dev/image-test` 패턴과 동일)
- 프론트 검증 게이트: `npm run lint` + `npm run build` (테스트 러너 없음 → 빌드·린트·수동 클릭 테스트)
- 모든 작업 디렉토리: 백엔드 `backend/`, 프론트 `frontend/` (각각 독립 git repo)

---

## File Structure

**백엔드 (`backend/`)**
- `app/config.py` — `ai_image_edit_api_url` 설정 추가 (modify)
- `.env.example` — edit URL 항목 추가 (modify)
- `app/adapters/ai_client.py` — `edit_image()` + 공유 재시도 헬퍼 (modify)
- `app/schemas/persona.py` — `Persona`, `ImagePrompts` 모델 (create)
- `app/core/prompts/image_prompt.py` — AI-05 프롬프트 빌더 + 폴백 (create)
- `app/services/ai_service.py` — `generate_image_prompts()` 함수 (modify)
- `app/services/persona_pipeline.py` — `generate_card()` 오케스트레이터 (create)
- `app/schemas/dev.py` — persona-card 요청/응답 (modify)
- `app/routers/dev.py` — `POST /api/dev/persona-card` (modify)
- `tests/test_ai_client_edit_image.py` (create)
- `tests/test_image_prompts.py` (create)
- `tests/test_persona_pipeline.py` (create)
- `tests/test_dev_persona_card.py` (create)

**프론트 (`frontend/`)**
- `lib/mock/devFlow.ts` — mock Q&A·페르소나 후보 (create)
- `app/dev/flow/page.tsx` — 단계형 흐름 (create)
- `app/dev/page.tsx` — `/dev/flow` 도구 카드 추가 (modify)

---

## Task 1: AIClient.edit_image (얼굴 입력 image-edit)

**Files:**
- Modify: `backend/app/config.py` (Settings에 `ai_image_edit_api_url`)
- Modify: `backend/.env.example`
- Modify: `backend/app/adapters/ai_client.py`
- Test: `backend/tests/test_ai_client_edit_image.py`

**Interfaces:**
- Consumes: 기존 `_extract_image_bytes`, `_RetryableImageError`, `inspect_image`, `ExternalServiceError`
- Produces:
  - `Settings.ai_image_edit_api_url: str`
  - `AIClient(__init__)` 신규 키워드 인자 `image_edit_api_url: str = ""`
  - `AIClient.edit_image(purpose: AIPurpose, prompt: str, image: bytes, *, size: str | None = None) -> bytes`

- [ ] **Step 1: config에 edit URL 설정 추가**

`backend/app/config.py`의 이미지 설정 블록(`ai_image_response_format` 줄 아래)에 추가:

```python
    # 얼굴 입력(image-to-image) — edits 경로. 빈 문자열이면 edit_image 사용 불가.
    ai_image_edit_api_url: str = ""
```

`backend/.env.example`의 `AI_IMAGE_RESPONSE_FORMAT=` 아래에 추가:

```bash
# 얼굴 입력(증명사진 → 미래 인물). edits 엔드포인트. 미지원 게이트웨이면 비워둠.
#   Mindlogic: edits 지원 시 해당 URL, 미지원 시 OpenAI 직결로 분기
#   OpenAI 직결 예: https://api.openai.com/v1/images/edits
AI_IMAGE_EDIT_API_URL=
```

- [ ] **Step 2: 실패 테스트 작성**

`backend/tests/test_ai_client_edit_image.py`:

```python
"""AIClient.edit_image 하드닝 테스트 (httpx MockTransport, 실제 API 호출 없음)."""

from __future__ import annotations

import base64
from collections.abc import Callable
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError

_EDIT_URL = "https://img.test/edits"


def _png(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _b64_body(png: bytes) -> dict[str, object]:
    return {"data": [{"b64_json": base64.b64encode(png).decode("ascii")}]}


def _client(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    api_key: str = "test-key",
    edit_url: str = _EDIT_URL,
    max_retries: int = 2,
) -> AIClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AIClient(
        chat_base_url="",
        chat_api_key="",
        chat_model_map={},
        image_api_url="https://img.test/generate",
        image_edit_api_url=edit_url,
        image_api_key=api_key,
        image_model="gpt-image-1",
        image_size="1024x1024",
        image_response_format="",
        image_timeout_seconds=5.0,
        image_concurrency=4,
        image_max_retries=max_retries,
        image_retry_base_delay=0.0,
        http_client=http,
    )


async def test_edit_success_b64() -> None:
    png = _png()
    client = _client(lambda req: httpx.Response(200, json=_b64_body(png)))
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "make future self", _png())
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    await client.aclose()


async def test_edit_sends_multipart_to_edit_url() -> None:
    seen = {"url": "", "ctype": ""}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["ctype"] = req.headers.get("content-type", "")
        return httpx.Response(200, json=_b64_body(_png()))

    client = _client(handler)
    await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert seen["url"] == _EDIT_URL
    assert seen["ctype"].startswith("multipart/form-data")
    await client.aclose()


async def test_edit_retry_on_429_then_success() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=_b64_body(_png()))

    client = _client(handler)
    data = await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert data[:4] == b"\x89PNG"
    assert calls["n"] == 2
    await client.aclose()


async def test_edit_4xx_fails_fast() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    client = _client(handler)
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    assert calls["n"] == 1
    await client.aclose()


async def test_edit_without_url_raises() -> None:
    client = _client(lambda req: httpx.Response(200), edit_url="")
    with pytest.raises(ExternalServiceError):
        await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png())
    await client.aclose()
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_ai_client_edit_image.py -v`
Expected: FAIL — `AIClient.__init__() got an unexpected keyword argument 'image_edit_api_url'`

- [ ] **Step 4: 공유 재시도 헬퍼로 리팩터 + edit_image 구현**

`backend/app/adapters/ai_client.py` 수정:

(a) `__init__` 시그니처에 `image_api_url` 다음 줄로 추가하고, 본문에 저장:

```python
        image_api_url: str,
        image_edit_api_url: str,
```

본문 `self._image_api_url = image_api_url` 아래:

```python
        self._image_edit_api_url = image_edit_api_url
```

(b) `from_settings`의 `image_api_url=settings.ai_image_api_url,` 다음 줄에 추가:

```python
            image_edit_api_url=settings.ai_image_edit_api_url,
```

(c) 기존 `generate_image`의 재시도 루프를 공유 헬퍼로 추출. `generate_image` 메서드 본문에서 `last_error: Exception | None = None` 부터 끝의 `raise ExternalServiceError(...)`까지를 다음으로 교체:

```python
        async def _attempt() -> bytes:
            return await self._image_attempt(payload, headers)

        return await self._run_with_image_retries(purpose, _attempt)
```

그리고 `generate_image` 메서드 바로 아래에 헬퍼와 `edit_image`를 추가:

```python
    async def _run_with_image_retries(
        self, purpose: AIPurpose, attempt: Callable[[], Awaitable[bytes]]
    ) -> bytes:
        """이미지 1회 시도(attempt)를 검증·지수백오프 재시도로 감싼다."""
        last_error: Exception | None = None
        for n in range(self._image_max_retries + 1):
            try:
                data = await attempt()
                inspect_image(data)
                return data
            except (_RetryableImageError, ImageValidationError) as exc:
                last_error = exc
                if n < self._image_max_retries:
                    delay = self._image_retry_base_delay * (2**n)
                    logger.warning(
                        "image.retry",
                        purpose=str(purpose),
                        attempt=n + 1,
                        max_attempts=self._image_max_retries + 1,
                        delay=delay,
                        reason=str(exc),
                    )
                    await asyncio.sleep(delay)
                    continue
                break
        raise ExternalServiceError(
            "이미지 생성에 실패했습니다 (재시도 소진).",
            details={
                "purpose": str(purpose),
                "attempts": self._image_max_retries + 1,
                "reason": str(last_error),
            },
        )

    async def edit_image(
        self,
        purpose: AIPurpose,
        prompt: str,
        image: bytes,
        *,
        size: str | None = None,
    ) -> bytes:
        """입력 이미지(얼굴) + 프롬프트로 image-edit 생성. 검증된 bytes 반환."""
        if not self._image_api_key:
            raise ExternalServiceError("AI_IMAGE_API_KEY가 설정되지 않았습니다.")
        if not self._image_edit_api_url:
            raise ExternalServiceError("AI_IMAGE_EDIT_API_URL이 설정되지 않았습니다.")

        async def _attempt() -> bytes:
            return await self._image_edit_attempt(prompt, image, size)

        return await self._run_with_image_retries(purpose, _attempt)

    async def _image_edit_attempt(
        self, prompt: str, image: bytes, size: str | None
    ) -> bytes:
        """edits 엔드포인트 multipart 1회 호출 → bytes."""
        data: dict[str, str] = {
            "model": self._image_model,
            "prompt": prompt,
            "size": size or self._image_size,
            "n": "1",
        }
        if self._image_response_format:
            data["response_format"] = self._image_response_format
        files = {"image": ("photo.png", image, "image/png")}
        headers = {"Authorization": f"Bearer {self._image_api_key}"}  # 멀티파트는 httpx가 Content-Type 설정

        async with self._image_sem:
            try:
                response = await self._http.post(
                    self._image_edit_api_url, headers=headers, data=data, files=files
                )
            except httpx.TimeoutException as exc:
                raise _RetryableImageError(f"timeout: {exc}") from exc
            except httpx.HTTPError as exc:
                raise _RetryableImageError(f"network: {exc}") from exc

        if response.status_code == 429 or response.status_code >= 500:
            raise _RetryableImageError(f"status {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise ExternalServiceError(
                "이미지 edit API가 오류를 반환했습니다.",
                details={"status": response.status_code, "body": response.text[:500]},
            )

        return await self._extract_image_bytes(response)
```

(d) 파일 상단 import에 `Callable`, `Awaitable` 추가. 기존 `from typing import Any`를 다음으로 교체:

```python
from collections.abc import Awaitable, Callable
from typing import Any
```

- [ ] **Step 5: 신규 + 기존 이미지 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_ai_client_edit_image.py tests/test_ai_client_image.py -v`
Expected: PASS (신규 5개 + 기존 generate 테스트 전부 — 리팩터가 회귀 없는지 확인)

- [ ] **Step 6: 린트·타입체크**

Run: `cd backend && uv run ruff check app/adapters/ai_client.py app/config.py && uv run mypy app/adapters/ai_client.py`
Expected: 통과

- [ ] **Step 7: 커밋**

```bash
cd backend && git add app/adapters/ai_client.py app/config.py .env.example tests/test_ai_client_edit_image.py
git commit -m "feat: AIClient.edit_image (얼굴 입력 image-edit) + 공유 재시도 헬퍼"
```

---

## Task 2: AI-05 이미지 프롬프트 생성

**Files:**
- Create: `backend/app/schemas/persona.py`
- Create: `backend/app/core/prompts/image_prompt.py`
- Modify: `backend/app/services/ai_service.py`
- Test: `backend/tests/test_image_prompts.py`

**Interfaces:**
- Consumes: `AIClient.chat`, `AIPurpose.IMAGE_PROMPT`, `ExternalServiceError`
- Produces:
  - `app.schemas.persona.Persona(name: str, tagline: str, keywords: list[str], fields: list[str])` (pydantic BaseModel)
  - `app.schemas.persona.ImagePrompts(portrait_prompt: str, background_prompt: str)` (pydantic BaseModel)
  - `app.core.prompts.image_prompt.build_messages(persona: Persona) -> list[dict[str, str]]`
  - `app.core.prompts.image_prompt.fallback_prompts(persona: Persona) -> ImagePrompts`
  - `app.services.ai_service.generate_image_prompts(ai, persona: Persona) -> ImagePrompts` (async)

- [ ] **Step 1: Persona/ImagePrompts 스키마 작성**

`backend/app/schemas/persona.py`:

```python
"""페르소나·이미지 프롬프트 도메인 모델 (저장 무관, 파이프라인 입출력)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Persona(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    tagline: str = Field("", max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=8)
    fields: list[str] = Field(default_factory=list, max_length=8)


class ImagePrompts(BaseModel):
    portrait_prompt: str = Field(..., min_length=1, max_length=4000)
    background_prompt: str = Field(..., min_length=1, max_length=4000)
```

- [ ] **Step 2: 프롬프트 빌더·폴백 작성**

`backend/app/core/prompts/image_prompt.py`:

```python
"""AI-05: 페르소나 → 인물·배경 이미지 프롬프트.

chat 모델이 영문 프롬프트 2개를 JSON으로 산출하게 한다.
파싱·검증 실패 시 fallback_prompts로 파이프라인을 멈추지 않는다.
"""

from __future__ import annotations

from app.schemas.persona import ImagePrompts, Persona

_SYSTEM = (
    "You write concise English prompts for an image generator that produces "
    "a future-career persona card. Return ONLY JSON with keys "
    '"portrait_prompt" and "background_prompt". '
    "portrait_prompt: a confident future professional portrait (2:3, studio lighting). "
    "background_prompt: a cinematic workplace/world scene (3:2) for that career. "
    "No text, logos, or watermarks in the images. Keep each prompt under 600 characters."
)


def build_messages(persona: Persona) -> list[dict[str, str]]:
    keywords = ", ".join(persona.keywords) or "(none)"
    fields = ", ".join(persona.fields) or "(none)"
    user = (
        f"Persona name: {persona.name}\n"
        f"Tagline: {persona.tagline}\n"
        f"Keywords: {keywords}\n"
        f"Related fields: {fields}\n"
        "Write the two image prompts."
    )
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": user},
    ]


def fallback_prompts(persona: Persona) -> ImagePrompts:
    """AI 실패 시 결정적 템플릿. fields/keywords로 안전한 프롬프트 구성."""
    subject = ", ".join(persona.fields) or persona.name
    mood = ", ".join(persona.keywords) or "inspiring, modern"
    return ImagePrompts(
        portrait_prompt=(
            f"Studio portrait of a confident future professional working in {subject}. "
            "Clean lighting, 2:3 ratio, photorealistic, no text or watermark."
        ),
        background_prompt=(
            f"Cinematic workplace scene representing a career in {subject}, "
            f"mood: {mood}. Wide 3:2 ratio, no text or watermark."
        ),
    )
```

- [ ] **Step 3: 실패 테스트 작성**

`backend/tests/test_image_prompts.py`:

```python
"""ai_service.generate_image_prompts 파싱·검증·폴백 테스트 (chat stub)."""

from __future__ import annotations

import json
from types import SimpleNamespace

from app.schemas.persona import ImagePrompts, Persona
from app.services.ai_service import generate_image_prompts

_PERSONA = Persona(
    name="숲을 지키는 드론 전문가",
    tagline="자연과 기술로 생태를 지키는 미래형 탐사 역할",
    keywords=["자연", "드론", "탐사"],
    fields=["환경공학", "항공기술"],
)


def _chat_response(content: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


class _StubAI:
    """chat 응답을 순서대로 돌려주는 stub."""

    def __init__(self, contents: list[str]) -> None:
        self._contents = contents
        self.calls = 0

    async def chat(self, purpose, messages, **kwargs):  # noqa: ANN001
        content = self._contents[min(self.calls, len(self._contents) - 1)]
        self.calls += 1
        return _chat_response(content)


async def test_valid_json_parsed() -> None:
    body = json.dumps(
        {"portrait_prompt": "a future drone ranger portrait", "background_prompt": "a forest"}
    )
    ai = _StubAI([body])
    result = await generate_image_prompts(ai, _PERSONA)
    assert isinstance(result, ImagePrompts)
    assert result.portrait_prompt == "a future drone ranger portrait"
    assert ai.calls == 1


async def test_retries_once_on_bad_json_then_succeeds() -> None:
    good = json.dumps({"portrait_prompt": "p", "background_prompt": "b"})
    ai = _StubAI(["not json at all", good])
    result = await generate_image_prompts(ai, _PERSONA)
    assert result.portrait_prompt == "p"
    assert ai.calls == 2


async def test_falls_back_after_persistent_failure() -> None:
    ai = _StubAI(["garbage", "still garbage"])
    result = await generate_image_prompts(ai, _PERSONA)
    # 폴백은 fields 기반 결정적 프롬프트
    assert "환경공학" in result.portrait_prompt or "항공기술" in result.portrait_prompt
    assert ai.calls == 2  # 1 + 1 재시도 후 폴백


async def test_falls_back_on_banned_word() -> None:
    body = json.dumps({"portrait_prompt": "nsfw content", "background_prompt": "b"})
    ai = _StubAI([body, body])
    result = await generate_image_prompts(ai, _PERSONA)
    assert "nsfw" not in result.portrait_prompt.lower()
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_image_prompts.py -v`
Expected: FAIL — `ImportError: cannot import name 'generate_image_prompts'`

- [ ] **Step 5: generate_image_prompts 구현**

`backend/app/services/ai_service.py`의 기존 `AIService` 클래스는 그대로 두고(향후 AI-01~04용), 파일 끝에 모듈 함수를 추가. 파일 상단 import 교체:

```python
"""AI 호출 비즈니스 래퍼.

- Adapter(AIClient)는 단순 호출, Service는 응답 검증·후처리·재시도 정책 적용.
- generate_image_prompts (AI-05): persona → 영문 이미지 프롬프트 2개.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

from app.adapters.ai_client import AIPurpose
from app.core.logging import get_logger
from app.core.prompts.image_prompt import build_messages, fallback_prompts
from app.schemas.persona import ImagePrompts, Persona

logger = get_logger(__name__)

_BANNED = ("nsfw", "explicit", "gore")
```

기존 `class AIService:` 정의는 유지(메서드 stub 그대로). 파일 끝에 추가:

```python
class _ChatClient(Protocol):
    async def chat(
        self, purpose: AIPurpose, messages: list[dict[str, Any]], **kwargs: Any
    ) -> Any: ...


def _parse(content: str | None) -> ImagePrompts | None:
    """chat 응답 본문 → 검증된 ImagePrompts. 실패하면 None."""
    if not content:
        return None
    try:
        data = json.loads(content)
        prompts = ImagePrompts(
            portrait_prompt=str(data["portrait_prompt"]).strip(),
            background_prompt=str(data["background_prompt"]).strip(),
        )
    except (ValueError, KeyError, TypeError):
        return None
    blob = f"{prompts.portrait_prompt} {prompts.background_prompt}".lower()
    if any(bad in blob for bad in _BANNED):
        return None
    return prompts


async def generate_image_prompts(ai: _ChatClient, persona: Persona) -> ImagePrompts:
    """AI-05. persona → 이미지 프롬프트 2개. 최대 2회 시도 후 폴백."""
    messages = build_messages(persona)
    for attempt in range(2):
        resp = await ai.chat(
            AIPurpose.IMAGE_PROMPT, messages, response_format={"type": "json_object"}
        )
        content = resp.choices[0].message.content
        prompts = _parse(content)
        if prompts is not None:
            return prompts
        logger.warning("image_prompt.invalid", attempt=attempt + 1)
    logger.warning("image_prompt.fallback", persona=persona.name)
    return fallback_prompts(persona)
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_image_prompts.py -v`
Expected: PASS (4개)

- [ ] **Step 7: 린트·타입체크**

Run: `cd backend && uv run ruff check app/services/ai_service.py app/schemas/persona.py app/core/prompts/image_prompt.py && uv run mypy app/services/ai_service.py`
Expected: 통과

- [ ] **Step 8: 커밋**

```bash
cd backend && git add app/schemas/persona.py app/core/prompts/image_prompt.py app/services/ai_service.py tests/test_image_prompts.py
git commit -m "feat: AI-05 이미지 프롬프트 생성 (검증·폴백)"
```

---

## Task 3: persona_pipeline.generate_card 오케스트레이터

**Files:**
- Create: `backend/app/services/persona_pipeline.py`
- Test: `backend/tests/test_persona_pipeline.py`

**Interfaces:**
- Consumes: `generate_image_prompts` (Task 2), `AIClient.generate_image`/`edit_image` (Task 1), `card_renderer.render_card`/`PersonaCardContent`, `AIPurpose`, `schemas.persona.Persona`
- Produces:
  - `app.services.persona_pipeline.CardResult` (frozen dataclass: `card_png: bytes`, `prompts: ImagePrompts`)
  - `app.services.persona_pipeline.generate_card(ai, persona: Persona, *, photo: bytes | None, qr_data: str) -> CardResult` (async)

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_persona_pipeline.py`:

```python
"""persona_pipeline.generate_card 오케스트레이션 테스트 (AI stub)."""

from __future__ import annotations

import json
from io import BytesIO
from types import SimpleNamespace

from PIL import Image

from app.adapters.ai_client import AIPurpose
from app.schemas.persona import Persona
from app.services.persona_pipeline import generate_card

_PERSONA = Persona(
    name="미래 도시 설계자",
    tagline="더 나은 삶의 공간을 기획하는 분석형 리더",
    keywords=["분석", "공간", "기획"],
    fields=["건축공학", "스마트시티"],
)


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 64), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    def __init__(self) -> None:
        self.generated: list[AIPurpose] = []
        self.edited: list[AIPurpose] = []

    async def chat(self, purpose, messages, **kwargs):  # noqa: ANN001
        body = json.dumps({"portrait_prompt": "portrait", "background_prompt": "bg"})
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=body))]
        )

    async def generate_image(self, purpose, prompt, *, size=None, n=1):  # noqa: ANN001
        self.generated.append(purpose)
        return _png()

    async def edit_image(self, purpose, prompt, image, *, size=None):  # noqa: ANN001
        self.edited.append(purpose)
        return _png()


async def test_generate_card_without_photo_uses_text_to_image() -> None:
    ai = _StubAI()
    result = await generate_card(ai, _PERSONA, photo=None, qr_data="https://nabe.test/c/x")
    assert result.card_png[:8] == b"\x89PNG\r\n\x1a\n"
    assert AIPurpose.PORTRAIT_IMAGE in ai.generated  # 사진 없으면 generate
    assert AIPurpose.WORLD_IMAGE in ai.generated
    assert ai.edited == []


async def test_generate_card_with_photo_uses_edit_for_portrait() -> None:
    ai = _StubAI()
    result = await generate_card(ai, _PERSONA, photo=_png(), qr_data="https://nabe.test/c/x")
    assert result.card_png[:4] == b"\x89PNG"
    assert ai.edited == [AIPurpose.PORTRAIT_IMAGE]  # 사진 있으면 edit
    assert ai.generated == [AIPurpose.WORLD_IMAGE]  # 배경은 항상 generate
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_persona_pipeline.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.persona_pipeline'`

- [ ] **Step 3: persona_pipeline 구현**

`backend/app/services/persona_pipeline.py`:

```python
"""페르소나 → 카드 PNG 오케스트레이터.

흐름: AI-05 프롬프트 → 인물(얼굴 있으면 edit, 없으면 generate) ‖ 배경(generate)
     → render_card. 인물·배경 둘 다 성공해야 카드 발급.
저장(DB/Storage)은 이 모듈 책임 밖 — bytes만 반환한다.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app.adapters.ai_client import AIClient, AIPurpose
from app.core.errors import ExternalServiceError
from app.schemas.persona import ImagePrompts, Persona
from app.services.ai_service import generate_image_prompts
from app.services.card_image_service import BACKGROUND_SIZE, PORTRAIT_SIZE
from app.services.card_renderer import PersonaCardContent, render_card


@dataclass(frozen=True)
class CardResult:
    card_png: bytes
    prompts: ImagePrompts


async def _portrait(ai: AIClient, prompt: str, photo: bytes | None) -> bytes:
    if photo is not None:
        return await ai.edit_image(AIPurpose.PORTRAIT_IMAGE, prompt, photo, size=PORTRAIT_SIZE)
    return await ai.generate_image(AIPurpose.PORTRAIT_IMAGE, prompt, size=PORTRAIT_SIZE)


async def generate_card(
    ai: AIClient,
    persona: Persona,
    *,
    photo: bytes | None,
    qr_data: str,
) -> CardResult:
    prompts = await generate_image_prompts(ai, persona)

    results = await asyncio.gather(
        _portrait(ai, prompts.portrait_prompt, photo),
        ai.generate_image(AIPurpose.WORLD_IMAGE, prompts.background_prompt, size=BACKGROUND_SIZE),
        return_exceptions=True,
    )
    portrait_result, background_result = results

    failures: dict[str, str] = {}
    if isinstance(portrait_result, BaseException):
        failures["portrait"] = str(portrait_result)
    if isinstance(background_result, BaseException):
        failures["background"] = str(background_result)
    if failures:
        raise ExternalServiceError(
            "카드 이미지 생성에 실패했습니다.",
            details={"failed": list(failures), "reasons": failures},
        )

    assert isinstance(portrait_result, bytes)
    assert isinstance(background_result, bytes)

    content = PersonaCardContent(
        title=persona.name, tagline=persona.tagline, keywords=persona.keywords
    )
    card_png = await run_in_threadpool(
        render_card, background_result, portrait_result, content, qr_data
    )
    return CardResult(card_png=card_png, prompts=prompts)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_persona_pipeline.py -v`
Expected: PASS (2개)

- [ ] **Step 5: 린트·타입체크**

Run: `cd backend && uv run ruff check app/services/persona_pipeline.py && uv run mypy app/services/persona_pipeline.py`
Expected: 통과

- [ ] **Step 6: 커밋**

```bash
cd backend && git add app/services/persona_pipeline.py tests/test_persona_pipeline.py
git commit -m "feat: persona_pipeline.generate_card (프롬프트→이미지→카드)"
```

---

## Task 4: POST /api/dev/persona-card 엔드포인트

**Files:**
- Modify: `backend/app/schemas/dev.py`
- Modify: `backend/app/routers/dev.py`
- Test: `backend/tests/test_dev_persona_card.py`

**Interfaces:**
- Consumes: `persona_pipeline.generate_card` (Task 3), `schemas.persona.Persona`, `AIClientDep`, `get_ai_client`
- Produces: `POST /api/dev/persona-card` — body `GeneratePersonaCardRequest`, 응답 `GeneratePersonaCardResponse`

- [ ] **Step 1: 요청/응답 스키마 추가**

`backend/app/schemas/dev.py` 끝에 추가 (상단 import에 `from app.schemas.persona import Persona` 추가):

```python
class GeneratePersonaCardRequest(BaseModel):
    """선택된 (mock) 페르소나로 실제 카드 생성."""

    persona: Persona
    photo_base64: str | None = Field(
        None, description="증명사진 PNG/JPEG의 base64. 없으면 text→image."
    )
    qr_data: str = Field(
        "https://nabe.example/c/demo", max_length=512, description="QR에 인코딩할 문자열."
    )


class GeneratePersonaCardResponse(BaseModel):
    persona: Persona
    card_base64: str = Field(..., description="완성 카드 PNG의 base64")
    portrait_prompt: str
    background_prompt: str
    elapsed_seconds: float
```

- [ ] **Step 2: 실패 테스트 작성**

`backend/tests/test_dev_persona_card.py`:

```python
"""POST /api/dev/persona-card 통합 테스트 (AI 의존성 stub 주입)."""

from __future__ import annotations

import base64
import json
from io import BytesIO
from types import SimpleNamespace

import httpx
from PIL import Image

from app.deps import get_ai_client
from app.main import create_app


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 64), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    async def chat(self, purpose, messages, **kwargs):  # noqa: ANN001
        body = json.dumps({"portrait_prompt": "p", "background_prompt": "b"})
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=body))]
        )

    async def generate_image(self, purpose, prompt, *, size=None, n=1):  # noqa: ANN001
        return _png()

    async def edit_image(self, purpose, prompt, image, *, size=None):  # noqa: ANN001
        return _png()


async def test_persona_card_endpoint_returns_card() -> None:
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: _StubAI()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/persona-card",
            json={
                "persona": {
                    "name": "미래 도시 설계자",
                    "tagline": "분석형 리더",
                    "keywords": ["분석", "공간"],
                    "fields": ["건축공학"],
                },
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
                "qr_data": "https://nabe.test/c/x",
            },
        )
    assert res.status_code == 200
    data = res.json()
    card = base64.b64decode(data["card_base64"])
    assert card[:8] == b"\x89PNG\r\n\x1a\n"
    assert data["persona"]["name"] == "미래 도시 설계자"
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_dev_persona_card.py -v`
Expected: FAIL — 404 (엔드포인트 없음)

- [ ] **Step 4: 엔드포인트 구현**

`backend/app/routers/dev.py` 수정:

(a) import 추가 (기존 import 블록에):

```python
from app.schemas.dev import (
    GenerateCardRequest,
    GenerateCardResponse,
    GenerateImageRequest,
    GenerateImageResponse,
    GeneratePersonaCardRequest,
    GeneratePersonaCardResponse,
    ImageTarget,
)
from app.services.persona_pipeline import generate_card
```

(b) 파일 끝에 핸들러 추가:

```python
@router.post("/persona-card", response_model=GeneratePersonaCardResponse)
async def generate_persona_card(
    req: GeneratePersonaCardRequest, ai: AIClientDep
) -> GeneratePersonaCardResponse:
    """선택된 페르소나 → AI-05 프롬프트 → 인물(얼굴)·배경 → 카드 합성."""
    photo = base64.b64decode(req.photo_base64) if req.photo_base64 else None

    started = time.perf_counter()
    result = await generate_card(ai, req.persona, photo=photo, qr_data=req.qr_data)
    elapsed = time.perf_counter() - started

    return GeneratePersonaCardResponse(
        persona=req.persona,
        card_base64=base64.b64encode(result.card_png).decode("ascii"),
        portrait_prompt=result.prompts.portrait_prompt,
        background_prompt=result.prompts.background_prompt,
        elapsed_seconds=round(elapsed, 2),
    )
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_dev_persona_card.py -v`
Expected: PASS

- [ ] **Step 6: 전체 백엔드 테스트·린트·타입체크**

Run: `cd backend && uv run pytest && uv run ruff check . && uv run mypy app`
Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
cd backend && git add app/schemas/dev.py app/routers/dev.py tests/test_dev_persona_card.py
git commit -m "feat: POST /api/dev/persona-card 엔드포인트"
```

---

## Task 5: 프론트 mock 데이터 (devFlow.ts)

**Files:**
- Create: `frontend/lib/mock/devFlow.ts`

**Interfaces:**
- Produces:
  - `DevQA { question: string; answer: string }`
  - `DevPersona { name: string; tagline: string; keywords: string[]; fields: string[] }`
  - `devCoreQuestions: DevQA[]` (Q1~6), `devAdaptiveQuestions: DevQA[]` (Q7~9)
  - `devPersonaCandidates: DevPersona[]` (3개)

- [ ] **Step 1: mock 데이터 작성**

`frontend/lib/mock/devFlow.ts`:

```ts
export interface DevQA {
  question: string;
  answer: string;
}

export interface DevPersona {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

// Q1~6: 고정 질문 (한 페이지에 함께 표시)
export const devCoreQuestions: DevQA[] = [
  { question: "어떤 문제를 해결하는 사람이 되고 싶나요?", answer: "자연과 사람을 동시에 지키는 일" },
  { question: "하루 중 가장 몰입되는 순간은?", answer: "새로운 도구로 무언가를 만들 때" },
  { question: "끌리는 작업 환경은?", answer: "야외 현장과 연구소를 오가는 환경" },
  { question: "나를 잘 나타내는 단어는?", answer: "분석적인, 활동적인, 꼼꼼한" },
  { question: "혼자 vs 함께?", answer: "혼자 깊이 파고든 뒤 동료와 완성" },
  { question: "예상치 못한 상황엔?", answer: "계획을 세워 차근차근 대응" },
];

// Q7~9: 적응형 생성 질문 (실제로는 AI 생성, 여기선 mock)
export const devAdaptiveQuestions: DevQA[] = [
  { question: "기술로 자연을 관측한다면 어떤 도구를 쓰고 싶나요?", answer: "드론과 센서" },
  { question: "현장에서 가장 보람을 느낄 순간은?", answer: "위험 지역을 안전하게 탐사했을 때" },
  { question: "10년 뒤 어떤 전문가로 불리고 싶나요?", answer: "생태를 지키는 탐사 기술 전문가" },
];

// Q10: 페르소나 후보 3개 — 학생이 1개 선택
export const devPersonaCandidates: DevPersona[] = [
  {
    name: "숲을 지키는 드론 전문가",
    tagline: "자연과 기술을 함께 활용해 생태를 지키는 미래형 탐사 역할",
    keywords: ["자연", "드론", "탐사", "기술", "보호"],
    fields: ["환경공학", "항공기술", "데이터 관측"],
  },
  {
    name: "미래 도시 설계자",
    tagline: "사람들이 더 나은 삶을 살 수 있는 공간을 기획하는 분석형 리더",
    keywords: ["분석", "공간", "기획", "문제해결", "도시혁신"],
    fields: ["건축공학", "스마트시티", "데이터분석"],
  },
  {
    name: "디지털 세계의 스토리텔러",
    tagline: "창의적인 아이디어로 사람들의 마음을 움직이는 콘텐츠 크리에이터",
    keywords: ["창의력", "스토리", "영상", "소통", "트렌드"],
    fields: ["미디어콘텐츠", "디지털마케팅", "커뮤니케이션"],
  },
];
```

- [ ] **Step 2: 린트 확인**

Run: `cd frontend && npx eslint lib/mock/devFlow.ts`
Expected: 통과 (에러 없음)

- [ ] **Step 3: 커밋**

```bash
cd frontend && git add lib/mock/devFlow.ts
git commit -m "feat: dev 흐름 mock 데이터 (Q&A·페르소나 후보)"
```

---

## Task 6: 프론트 /dev/flow 단계형 흐름 페이지

**Files:**
- Create: `frontend/app/dev/flow/page.tsx`
- Modify: `frontend/app/dev/page.tsx` (도구 카드 추가)

**Interfaces:**
- Consumes: `devCoreQuestions`, `devAdaptiveQuestions`, `devPersonaCandidates`, `DevPersona` (Task 5)
- Produces: `/dev/flow` 라우트 (UI)

- [ ] **Step 1: 흐름 페이지 작성**

`frontend/app/dev/flow/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  devAdaptiveQuestions,
  devCoreQuestions,
  devPersonaCandidates,
  type DevPersona,
  type DevQA,
} from "@/lib/mock/devFlow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 스텝: 0 사진 → 1 Q1~6 → 2 Q7 → 3 Q8 → 4 Q9 → 5 페르소나 선택 → 6 결과
const ADAPTIVE_START = 2;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function QABlock({ qa, index }: { qa: DevQA; index: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-white/60">Q{index}. {qa.question}</p>
      <p className="mt-1 font-medium">{qa.answer}</p>
    </div>
  );
}

export default function DevFlowPage() {
  const [step, setStep] = useState(0);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [selected, setSelected] = useState<DevPersona | null>(null);
  const [cardBase64, setCardBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPhotoBase64(await fileToBase64(file));
  }

  async function generate(persona: DevPersona) {
    setSelected(persona);
    setStep(6);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/dev/persona-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          photo_base64: photoBase64,
          qr_data: "https://nabe.example/c/dev",
        }),
      });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const data = await res.json();
      setCardBase64(data.card_base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-white">
      <h1 className="mb-6 text-2xl font-bold">페르소나 카드 생성 흐름 (dev)</h1>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-white/70">증명사진을 올리면 얼굴 기반 인물 이미지를 생성합니다. (선택)</p>
              <input type="file" accept="image/*" onChange={handlePhoto} />
              {photoBase64 && <p className="text-sm text-green-400">사진 준비됨 ✓</p>}
              <Button onClick={() => setStep(1)}>다음</Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-white/70">기본 질문 (Q1~6)</p>
              {devCoreQuestions.map((qa, i) => (
                <QABlock key={i} qa={qa} index={i + 1} />
              ))}
              <Button onClick={() => setStep(2)}>다음</Button>
            </div>
          )}

          {step >= ADAPTIVE_START && step <= 4 && (
            <div className="space-y-3">
              <p className="text-white/70">적응형 질문 Q{step + 5}</p>
              <QABlock qa={devAdaptiveQuestions[step - ADAPTIVE_START]} index={step + 5} />
              <Button onClick={() => setStep(step + 1)}>다음</Button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-white/70">Q10. 마음에 드는 페르소나를 골라주세요</p>
              <div className="grid gap-3">
                {devPersonaCandidates.map((p) => (
                  <Card
                    key={p.name}
                    className="cursor-pointer border-white/10 bg-white/5 transition hover:border-white/40"
                    onClick={() => generate(p)}
                  >
                    <CardContent className="p-4">
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-sm text-white/60">{p.tagline}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.keywords.map((k) => (
                          <Badge key={k} variant="secondary">{k}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              {loading && <p className="text-white/70">카드를 생성하고 있어요… (이미지 2장 생성 + 합성)</p>}
              {error && (
                <div className="space-y-3">
                  <p className="text-red-400">생성 실패: {error}</p>
                  <Button variant="secondary" onClick={() => selected && generate(selected)}>
                    다시 시도
                  </Button>
                </div>
              )}
              {cardBase64 && (
                <div className="space-y-3">
                  <p className="font-semibold">{selected?.name}</p>
                  <Image
                    src={`data:image/png;base64,${cardBase64}`}
                    alt="페르소나 카드"
                    width={1536}
                    height={968}
                    unoptimized
                    className="w-full rounded-xl"
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: dev 도구 목록에 진입 카드 추가**

`frontend/app/dev/page.tsx`의 `DEV_TOOLS` 배열 첫 항목(`href: "/dev/image-test"` 객체) **앞에** 추가:

```tsx
  {
    title: "카드 생성 흐름 (mock→실제)",
    description:
      "mock 질문/페르소나 선택을 버튼으로 진행한 뒤, 실제 AI로 인물·배경 이미지를 생성해 카드까지 만듭니다.",
    href: "/dev/flow",
    tag: "흐름",
    icon: Workflow,
    status: "active",
  },
```

(`Workflow` 아이콘은 이미 import되어 있음 — 기존 import 유지)

- [ ] **Step 3: 린트·빌드 확인**

Run: `cd frontend && npm run lint && npm run build`
Expected: 린트 통과 + 빌드 성공 (`/dev/flow` 라우트 포함)

- [ ] **Step 4: 수동 엔드투엔드 확인**

1. 백엔드 실행: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
   (얼굴 입력 테스트하려면 `.env`에 `AI_IMAGE_EDIT_API_URL`·`AI_IMAGE_API_KEY` 설정. 미설정 시 사진 없이 "다음"으로 진행 → text→image)
2. 프론트 실행: `cd frontend && npm run dev`
3. 브라우저 `/dev/flow` → 사진 업로드(또는 건너뛰기) → "다음" 5번 → 페르소나 1개 클릭 → 카드 표시 확인
   Expected: 완성된 페르소나 카드 PNG가 화면에 표시됨

- [ ] **Step 5: 커밋**

```bash
cd frontend && git add app/dev/flow/page.tsx app/dev/page.tsx
git commit -m "feat: /dev/flow 단계형 카드 생성 흐름 (mock→실제 이미지)"
```

---

## 자기 검토 결과 (작성자 셀프리뷰)

- **스펙 커버리지**: real/mock 경계(Task 2~4 real, Task 5~6 mock 흐름), 얼굴 입력(Task 1+3), AI-05 검증·폴백(Task 2), 병렬 이미지+카드 합성(Task 3), 엔드포인트(Task 4), dev 페이지 흐름(Task 5~6) — 스펙 §3·§4·§5·§6 모두 대응됨.
- **블로킹 검증 항목**(스펙 §3.2 — Mindlogic edits 지원): 코드는 `ai_image_edit_api_url` 설정으로 provider-무관하게 분리됨. 실제 edits 지원 여부는 Task 6 Step 4의 수동 확인 + `.env` 설정으로 검증 — 미지원 시 URL을 OpenAI 직결(`/v1/images/edits`)로 바꾸면 코드 변경 없이 동작. 사진 없이도 전체 흐름(text→image)은 항상 동작.
- **타입 일관성**: `Persona`/`ImagePrompts`(Task 2) → `generate_image_prompts`(Task 2) → `generate_card`/`CardResult`(Task 3) → 엔드포인트(Task 4) → 프론트 `DevPersona`(Task 5~6) 명칭·필드 일치 확인.
- **플레이스홀더 없음**: 모든 스텝에 실제 코드·명령·기대출력 포함.
