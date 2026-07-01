# 사진 → 인물 생성 dev 도구 (AI 모델 선택) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dev 환경에 사진 1장 + 프롬프트 + 선택한 AI 모델로 인물 이미지 한 장을 생성하는 도구를 추가한다.

**Architecture:** 기존 `AIClient.edit_image`(OpenRouter `/chat/completions` 이미지 경로)를 재사용하되, 이미지 모델을 **요청 단위로 오버라이드**할 수 있게 인자를 추가한다. 새 얇은 엔드포인트 `POST /api/dev/portrait`가 사진을 받아 `edit_image`를 호출하고, 새 프론트 페이지 `/dev/photo-portrait`가 사진 업로드·모델 선택·프롬프트 편집 UI를 제공한다.

**Tech Stack:** 백엔드 FastAPI + httpx + Pydantic + pytest(httpx MockTransport / ASGITransport). 프론트 Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn/ui.

## Global Constraints

- 백엔드 기본값 호환: 새 `model` 인자는 `str | None = None` 기본값 — 기존 호출(파이프라인·워커) 동작 불변.
- 인물 이미지 사이즈는 `PORTRAIT_SIZE = "1024x1536"` (2:3) 고정. strength·quality는 설정 기본값 사용.
- 사진은 **필수**. 프론트 UI 텍스트는 한국어.
- 프론트: 클라이언트 컴포넌트 `"use client"`, 경로 alias `@/*`, 아이콘 Lucide, `cn()` 사용.
- API base URL: `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`.
- 작업 디렉터리: 백엔드 `/Users/imincheol/Develop/i-be/backend`, 프론트 `/Users/imincheol/Develop/i-be/frontend`. (루트는 git 저장소 아님 — 커밋 단계는 생략하거나 환경에 맞게.)

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `backend/app/adapters/ai_client.py` | Modify | `generate_image`·`edit_image`·`_image_payload`에 `model` 오버라이드 |
| `backend/app/schemas/dev.py` | Modify | `GeneratePortraitRequest`/`Response` 추가 |
| `backend/app/routers/dev.py` | Modify | `POST /api/dev/portrait` 추가 |
| `backend/tests/test_ai_client_image.py` | Modify | `model` 오버라이드 payload 테스트 |
| `backend/tests/test_dev_portrait.py` | Create | 엔드포인트 통합 테스트 |
| `frontend/app/dev/photo-portrait/page.tsx` | Create | 사진→인물 생성 페이지 |
| `frontend/app/dev/page.tsx` | Modify | `DEV_TOOLS`에 카드 추가 |

---

## Task 1: `AIClient` 이미지 모델 요청별 오버라이드

**Files:**
- Modify: `backend/app/adapters/ai_client.py` (`_image_payload`, `generate_image`, `edit_image`)
- Test: `backend/tests/test_ai_client_image.py`

**Interfaces:**
- Produces:
  - `AIClient.generate_image(purpose, prompt, *, size=None, n=1, model: str | None = None) -> bytes`
  - `AIClient.edit_image(purpose, prompt, image, *, size=None, model: str | None = None) -> bytes`
  - 페이로드 `"model"` = `model or self._image_model`.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_ai_client_image.py` 파일 끝에 추가 (기존 `_client`/`_img_body`/`_png` 헬퍼 재사용):

```python
async def test_generate_image_uses_override_model() -> None:
    seen: dict[str, object] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=_img_body(_png()))

    client = _client(handler)  # 기본 image_model="google/gemini-2.5-flash-image"
    await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p", model="openai/some-model")
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "openai/some-model"
    await client.aclose()


async def test_generate_image_defaults_to_settings_model() -> None:
    seen: dict[str, object] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=_img_body(_png()))

    client = _client(handler)
    await client.generate_image(AIPurpose.PORTRAIT_IMAGE, "p")
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "google/gemini-2.5-flash-image"
    await client.aclose()


async def test_edit_image_uses_override_model() -> None:
    seen: dict[str, object] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=_img_body(_png()))

    client = _client(handler)
    await client.edit_image(AIPurpose.PORTRAIT_IMAGE, "p", _png(), model="openai/some-model")
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "openai/some-model"
    await client.aclose()
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_ai_client_image.py -k "override_model or defaults_to_settings_model" -v`
Expected: FAIL — `generate_image()` / `edit_image()` got an unexpected keyword argument `model`.

- [ ] **Step 3: 최소 구현**

`backend/app/adapters/ai_client.py` 의 `_image_payload`에 `model` 인자 추가:

```python
    def _image_payload(
        self,
        *,
        messages: list[dict[str, Any]],
        aspect_ratio: str,
        strength: float | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        image_config: dict[str, Any] = {"aspect_ratio": aspect_ratio}
        if self._image_quality:
            image_config["image_size"] = self._image_quality  # 1K/2K/4K (모델 지원 시)
        if strength is not None:
            image_config["strength"] = strength
        return {
            "model": model or self._image_model,
            "messages": messages,
            "modalities": ["image", "text"],
            "image_config": image_config,
        }
```

`generate_image` 시그니처와 payload 호출 수정:

```python
    async def generate_image(
        self,
        purpose: AIPurpose,  # 라벨용 (모델 분기는 추후)
        prompt: str,
        *,
        size: str | None = None,
        n: int = 1,  # 인터페이스 호환용 (OpenRouter는 1장 반환)
        model: str | None = None,
    ) -> bytes:
```

같은 함수 내 payload 생성 줄을 수정:

```python
        payload = self._image_payload(
            messages=[{"role": "user", "content": prompt}],
            aspect_ratio=_size_to_aspect_ratio(size or self._image_size),
            model=model,
        )
```

`edit_image` 시그니처와 payload 호출 수정:

```python
    async def edit_image(
        self,
        purpose: AIPurpose,
        prompt: str,
        image: bytes,
        *,
        size: str | None = None,
        model: str | None = None,
    ) -> bytes:
```

같은 함수 내 payload 생성 줄을 수정 (strength 인자는 유지):

```python
        payload = self._image_payload(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            aspect_ratio=_size_to_aspect_ratio(size or self._image_size),
            strength=self._image_strength,
            model=model,
        )
```

- [ ] **Step 4: 테스트 통과 확인 (회귀 포함)**

Run: `cd backend && uv run pytest tests/test_ai_client_image.py tests/test_ai_client_edit_image.py -v`
Expected: PASS (신규 3개 + 기존 전부).

- [ ] **Step 5: 커밋**

```bash
cd backend && git add app/adapters/ai_client.py tests/test_ai_client_image.py 2>/dev/null
git commit -m "feat(ai): support per-request image model override" 2>/dev/null || true
```

---

## Task 2: `POST /api/dev/portrait` 엔드포인트 + 스키마

**Files:**
- Modify: `backend/app/schemas/dev.py`
- Modify: `backend/app/routers/dev.py`
- Test: `backend/tests/test_dev_portrait.py` (Create)

**Interfaces:**
- Consumes: `AIClient.edit_image(..., model=...)` (Task 1), `card_image_service.PORTRAIT_SIZE`, `core.images.inspect_image`, `config.get_settings`.
- Produces: `POST /api/dev/portrait` → `GeneratePortraitResponse { image_base64, size_bytes, width, height, elapsed_seconds, model }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_dev_portrait.py` 생성:

```python
"""POST /api/dev/portrait 통합 테스트 (AI 의존성 stub 주입)."""

from __future__ import annotations

import base64
from io import BytesIO

import httpx
from PIL import Image

from app.deps import get_ai_client
from app.main import create_app


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 96), (30, 40, 50)).save(buf, format="PNG")
    return buf.getvalue()


class _StubAI:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def edit_image(self, purpose, prompt, image, *, size=None, model=None):
        self.calls.append({"prompt": prompt, "size": size, "model": model})
        return _png()


async def test_portrait_endpoint_returns_image_and_echoes_model() -> None:
    stub = _StubAI()
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: stub
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/portrait",
            json={
                "prompt": "portrait prompt",
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
                "model": "openai/some-model",
            },
        )
    assert res.status_code == 200
    data = res.json()
    img = base64.b64decode(data["image_base64"])
    assert img[:8] == b"\x89PNG\r\n\x1a\n"
    assert data["model"] == "openai/some-model"
    assert data["width"] == 64 and data["height"] == 96
    # edit_image가 모델 오버라이드와 함께 호출됐는지
    assert stub.calls[0]["model"] == "openai/some-model"
    assert stub.calls[0]["size"] == "1024x1536"


async def test_portrait_endpoint_defaults_model_when_omitted() -> None:
    stub = _StubAI()
    app = create_app()
    app.dependency_overrides[get_ai_client] = lambda: stub
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/dev/portrait",
            json={
                "prompt": "portrait prompt",
                "photo_base64": base64.b64encode(_png()).decode("ascii"),
            },
        )
    assert res.status_code == 200
    data = res.json()
    # model 미지정 → 응답엔 settings 기본 모델, edit_image엔 None(클라이언트 기본값 사용)
    assert data["model"] != ""
    assert stub.calls[0]["model"] is None
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && uv run pytest tests/test_dev_portrait.py -v`
Expected: FAIL — 404 또는 `GeneratePortraitRequest` import 에러.

- [ ] **Step 3: 스키마 추가**

`backend/app/schemas/dev.py` 끝에 추가:

```python
class GeneratePortraitRequest(BaseModel):
    """사진(필수) + 프롬프트 + 선택 모델로 인물 이미지 1장 생성."""

    prompt: str = Field(..., min_length=1, max_length=4000, description="인물 그림 설명(영문 권장)")
    photo_base64: str = Field(
        ..., min_length=1, description="얼굴 사진 PNG/JPEG의 base64 (필수)"
    )
    model: str | None = Field(
        None, description="이미지 모델 ID override. 미지정 시 서버 기본 이미지 모델."
    )


class GeneratePortraitResponse(BaseModel):
    image_base64: str = Field(..., description="인물 PNG의 base64")
    size_bytes: int
    width: int
    height: int
    elapsed_seconds: float
    model: str = Field(..., description="실제 사용된 이미지 모델 ID")
```

- [ ] **Step 4: 엔드포인트 추가**

`backend/app/routers/dev.py` 의 import 블록에 스키마 두 개와 `PORTRAIT_SIZE`를 추가한다.

`app.schemas.dev` import 목록에 다음 두 항목을 추가:

```python
    GeneratePortraitRequest,
    GeneratePortraitResponse,
```

`card_image_service` import 줄을 다음으로 교체:

```python
from app.services.card_image_service import PORTRAIT_SIZE, generate_card_images
```

파일 끝에 엔드포인트 추가:

```python
@router.post("/portrait", response_model=GeneratePortraitResponse)
async def generate_portrait(
    req: GeneratePortraitRequest, ai: AIClientDep
) -> GeneratePortraitResponse:
    """사진(필수) + 프롬프트 + 선택 모델 → 인물 이미지 1장 (2:3)."""
    photo = base64.b64decode(req.photo_base64)
    settings = get_settings()

    started = time.perf_counter()
    image_bytes = await ai.edit_image(
        AIPurpose.PORTRAIT_IMAGE, req.prompt, photo, size=PORTRAIT_SIZE, model=req.model
    )
    elapsed = time.perf_counter() - started

    info = inspect_image(image_bytes)
    return GeneratePortraitResponse(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        size_bytes=len(image_bytes),
        width=info.width,
        height=info.height,
        elapsed_seconds=round(elapsed, 2),
        model=req.model or settings.ai_image_model,
    )
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && uv run pytest tests/test_dev_portrait.py tests/test_dev_persona_card.py -v`
Expected: PASS (신규 2개 + 기존 persona-card 회귀).

- [ ] **Step 6: 커밋**

```bash
cd backend && git add app/schemas/dev.py app/routers/dev.py tests/test_dev_portrait.py 2>/dev/null
git commit -m "feat(dev): add POST /api/dev/portrait with model selection" 2>/dev/null || true
```

---

## Task 3: 프론트 페이지 `/dev/photo-portrait`

**Files:**
- Create: `frontend/app/dev/photo-portrait/page.tsx`

**Interfaces:**
- Consumes: `POST /api/dev/portrait` → `{ image_base64, size_bytes, width, height, elapsed_seconds, model }` (Task 2).
- shadcn: `Select` (`@/components/ui/select`), `Button`, `Card`, `Textarea`, `Input`, `Badge`, `Skeleton`.

- [ ] **Step 1: 페이지 생성**

`frontend/app/dev/photo-portrait/page.tsx` 생성:

```tsx
"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ImageUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface PortraitResponse {
  image_base64: string
  size_bytes: number
  width: number
  height: number
  elapsed_seconds: number
  model: string
}

interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// 기존 카드 생성 흐름의 인물 프롬프트(결정적 폴백 템플릿)를 기본값으로 복사.
const DEFAULT_PROMPT =
  "Photorealistic portrait of the same person from the photo, depicted at exactly 28 years old — an attractive, good-looking young adult with smooth clear skin, no wrinkles, no gray hair, stylish and polished, naturally beautiful/handsome, keeping their real facial identity, nice everyday adult attire, soft flattering lighting, 2:3 ratio, lifelike, no text or watermark."

// value "" → 서버 기본 모델(model 미전송). "custom" → 직접 입력.
const MODEL_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본값 (서버 설정 모델)" },
  { value: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image" },
  { value: "google/gemini-2.5-flash-image-preview", label: "Gemini 2.5 Flash Image" },
  { value: "custom", label: "직접 입력…" },
]

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export default function PhotoPortraitPage() {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [modelChoice, setModelChoice] = useState("")
  const [customModel, setCustomModel] = useState("")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PortraitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return
    setPhotoBase64(await fileToBase64(file))
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await handleFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  // 전송할 모델 ID: ""=미전송, "custom"=customModel, 그 외=프리셋 값.
  function resolveModel(): string | undefined {
    if (modelChoice === "") return undefined
    if (modelChoice === "custom") return customModel.trim() || undefined
    return modelChoice
  }

  async function handleGenerate() {
    if (!photoBase64) {
      setError("사진을 먼저 업로드해주세요")
      return
    }
    if (!prompt.trim()) {
      setError("프롬프트를 입력해주세요")
      return
    }
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const model = resolveModel()
      const res = await fetch(`${API_URL}/api/dev/portrait`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          photo_base64: photoBase64,
          ...(model ? { model } : {}),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null
        const msg = data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`
        const details = data?.error?.details
        const detailsStr = details ? `\n${JSON.stringify(details, null, 2)}` : ""
        throw new Error(`${msg}${detailsStr}`)
      }
      setResult((await res.json()) as PortraitResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const link = document.createElement("a")
    link.href = `data:image/png;base64,${result.image_base64}`
    link.download = `ibe-portrait-${result.model.replace(/[^a-z0-9]/gi, "-")}.png`
    link.click()
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <Link
          href="/dev"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="size-3.5" /> 개발 도구
        </Link>
        <Badge variant="secondary" className="mb-3 ml-2">
          dev
        </Badge>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">사진 → 인물 생성</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          얼굴 사진을 올리고 AI 모델을 골라{" "}
          <code className="font-mono text-xs">POST /api/dev/portrait</code> — 인물 이미지
          한 장(2:3)을 생성합니다.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {/* 사진 업로드 (필수) */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="text-sm font-semibold">사진 (필수)</div>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50",
              )}
            >
              <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              {photoBase64 ? (
                <>
                  <Image
                    src={`data:image/png;base64,${photoBase64}`}
                    alt="업로드한 사진"
                    width={112}
                    height={112}
                    unoptimized
                    className="size-28 rounded-lg object-cover"
                  />
                  <p className="text-sm text-green-600">사진 준비됨 ✓ — 클릭/드래그로 교체</p>
                </>
              ) : (
                <>
                  <ImageUp className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    여기로 사진을 드래그하거나 클릭해서 선택
                  </p>
                </>
              )}
            </label>
          </CardContent>
        </Card>

        {/* 모델 선택 + 프롬프트 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">AI 모델</div>
              <Select value={modelChoice} onValueChange={setModelChoice} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PRESETS.map((m) => (
                    <SelectItem key={m.value || "default"} value={m.value || "default"}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelChoice === "custom" && (
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="예) openai/gpt-image-1"
                  disabled={loading}
                  className="mt-2 font-mono text-xs"
                />
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                프롬프트 (기본값 = 카드 흐름 인물 프롬프트, 편집 가능)
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="text-xs text-muted-foreground">
          API: <code className="font-mono">{API_URL}</code>
        </div>
        <Button onClick={handleGenerate} disabled={loading || !photoBase64} size="lg">
          {loading ? "생성 중..." : "인물 생성"}
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-sm text-destructive">
              <div className="font-semibold mb-1">오류</div>
              <div className="font-mono text-xs whitespace-pre-wrap break-all">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 text-sm font-medium text-muted-foreground">생성된 인물 (2:3)</div>
          <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl border shadow-md bg-muted/30">
            <div className="relative w-full" style={{ aspectRatio: "2 / 3" }}>
              {result ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${result.image_base64}`}
                  alt="생성된 인물"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : loading ? (
                <Skeleton className="absolute inset-0 w-full h-full" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  생성 전
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className="mt-4 flex items-center justify-between">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Meta label="모델" value={result.model} />
                <Meta label="시간" value={`${result.elapsed_seconds}s`} />
                <Meta label="크기" value={`${(result.size_bytes / 1024).toFixed(0)} KB`} />
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                PNG 다운로드
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono break-all">{value}</div>
    </div>
  )
}
```

> 참고: `Select`는 빈 문자열 value를 허용하지 않으므로 "기본값" 항목의 value를 `"default"`로 두고, `resolveModel()`에서 `modelChoice === ""`(초기값) **또는** `"default"`를 미전송으로 처리해야 한다. Step 2에서 보정한다.

- [ ] **Step 2: "기본값" 항목 value 보정**

위 코드의 `resolveModel`과 초기 상태를 다음으로 맞춘다 — `useState("")` 대신 `useState("default")`로 초기화하고, `resolveModel` 첫 줄을 `if (modelChoice === "default") return undefined`로 바꾼다:

```tsx
  const [modelChoice, setModelChoice] = useState("default")
```

```tsx
  function resolveModel(): string | undefined {
    if (modelChoice === "default") return undefined
    if (modelChoice === "custom") return customModel.trim() || undefined
    return modelChoice
  }
```

(프리셋 렌더링은 이미 `value={m.value || "default"}`라 "기본값" 항목이 `"default"`로 렌더된다.)

- [ ] **Step 3: 린트·타입 확인**

Run: `cd frontend && npm run lint`
Expected: 신규 파일 관련 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add app/dev/photo-portrait/page.tsx 2>/dev/null
git commit -m "feat(dev): add photo -> portrait page with model select" 2>/dev/null || true
```

---

## Task 4: `/dev` 인덱스에 도구 카드 추가

**Files:**
- Modify: `frontend/app/dev/page.tsx` (`DEV_TOOLS` 배열)

- [ ] **Step 1: 카드 추가**

`frontend/app/dev/page.tsx` 의 `DEV_TOOLS` 배열에서, "페르소나 카드 생성" 항목 **다음에** 아래 항목을 추가:

```tsx
  {
    title: "사진 → 인물 생성",
    description:
      "얼굴 사진을 올리고 AI 모델을 골라 인물 이미지 한 장을 생성합니다. 모델별 결과를 비교할 때 사용하세요.",
    href: "/dev/photo-portrait",
    tag: "이미지",
    icon: ImageIcon,
    status: "active",
  },
```

(`ImageIcon`은 이미 `app/dev/page.tsx` 상단에서 import되어 있으므로 추가 import 불필요.)

- [ ] **Step 2: 린트 확인**

Run: `cd frontend && npm run lint`
Expected: 에러 없음.

- [ ] **Step 3: 엔드투엔드 클릭 테스트 (수동)**

1. 백엔드 실행: `cd backend && uv run uvicorn app.main:app --reload` (또는 docker-compose).
2. 프론트 실행: `cd frontend && npm run dev`.
3. 브라우저 `http://localhost:3000/dev` → "사진 → 인물 생성" 카드 클릭.
4. 사진 업로드 → 모델 "기본값" 상태로 "인물 생성" → 인물 이미지·메타(모델/시간/크기) 표시 확인.
5. 모델을 다른 프리셋/직접 입력으로 바꿔 재생성 → 응답 메타의 `모델` 값이 선택과 일치하는지 확인.
6. PNG 다운로드 동작 확인.

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add app/dev/page.tsx 2>/dev/null
git commit -m "feat(dev): list photo->portrait tool on dev index" 2>/dev/null || true
```

---

## Self-Review 결과

- **스펙 커버리지:** 모델 요청별 오버라이드(Task 1) / `/api/dev/portrait` + 사진 필수 + size 고정(Task 2) / 새 페이지·모델 프리셋+직접입력·기본 프롬프트·결과·다운로드(Task 3) / `/dev` 인덱스 카드(Task 4). 스펙 §2~§7 모두 대응.
- **플레이스홀더:** 없음 — 모든 코드 단계에 실제 코드 포함.
- **타입 일관성:** `model: str | None = None`(백엔드), `PortraitResponse`(프론트)·`GeneratePortraitResponse`(백엔드) 필드(`image_base64, size_bytes, width, height, elapsed_seconds, model`) 일치. `edit_image(..., model=...)` 시그니처 Task 1↔Task 2 일치.
- **알려진 주의점:** shadcn `Select`는 빈 문자열 value 비허용 → "기본값" 항목 value를 `"default"`로 처리(Task 3 Step 2). 모델 프리셋 ID는 실제 OpenRouter 호출로 동작 확인 후 조정 가능(직접 입력으로 우회 가능).
```
