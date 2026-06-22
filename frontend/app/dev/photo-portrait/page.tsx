"use client"

import { useEffect, useState } from "react"
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

interface ImageModel {
  id: string
  name: string
  input_per_m: number | null
  output_per_m: number | null
  per_image: number | null
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// 기존 카드 생성 흐름의 인물 프롬프트(결정적 폴백 템플릿)를 기본값으로 복사.
const DEFAULT_PROMPT =
  "Photorealistic portrait of the same person from the photo, depicted at exactly 28 years old — an attractive, good-looking young adult with smooth clear skin, no wrinkles, no gray hair, stylish and polished, naturally beautiful/handsome, keeping their real facial identity, nice everyday adult attire, soft flattering lighting, 2:3 ratio, lifelike, no text or watermark."

// 모델 가격을 한 줄 텍스트로. per-image 과금이면 장당, 아니면 토큰당(per 1M).
function priceText(m: ImageModel | null): string {
  if (!m) return "가격 정보 없음"
  if (m.per_image != null) return `$${m.per_image}/장`
  const parts: string[] = []
  if (m.input_per_m != null) parts.push(`입력 $${m.input_per_m}`)
  if (m.output_per_m != null) parts.push(`출력 $${m.output_per_m}`)
  return parts.length ? `${parts.join(" · ")} / 1M토큰` : "가격 정보 없음"
}

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
  const [modelChoice, setModelChoice] = useState("default")
  const [customModel, setCustomModel] = useState("")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PortraitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ImageModel[]>([])
  const [defaultModel, setDefaultModel] = useState<string>("")

  // 이미지 모델 목록 + 가격을 백엔드에서 조회(OpenRouter 무료 메타데이터).
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/dev/image-models`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { models: ImageModel[]; default: string } | null) => {
        if (cancelled || !data) return
        setModels(data.models)
        setDefaultModel(data.default)
      })
      .catch(() => {
        /* 목록 조회 실패해도 기본값/직접입력으로 계속 사용 가능 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 현재 선택된 모델 ID(기본값이면 서버 default)와 그 가격 정보.
  const selectedModelId =
    modelChoice === "default"
      ? defaultModel
      : modelChoice === "custom"
        ? customModel.trim()
        : modelChoice
  const selectedInfo = models.find((m) => m.id === selectedModelId) ?? null

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

  // 전송할 모델 ID: "default"=미전송, "custom"=customModel, 그 외=프리셋 값.
  function resolveModel(): string | undefined {
    if (modelChoice === "default") return undefined
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
                  <SelectItem value="default">기본값 (서버 설정 모델)</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{m.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {priceText(m)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">직접 입력…</SelectItem>
                </SelectContent>
              </Select>
              {modelChoice === "custom" && (
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="예) openai/gpt-5-image"
                  disabled={loading}
                  className="mt-2 font-mono text-xs"
                />
              )}
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-mono truncate">{selectedModelId || "—"}</span>
                <span className="font-mono shrink-0">
                  {selectedModelId ? priceText(selectedInfo) : ""}
                </span>
              </div>
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
