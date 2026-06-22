"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Download, ImageUp, Sparkles } from "lucide-react"
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
  height: number
  width: number
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

// 모델의 대표 비용 한 줄. per-image 과금이면 장당, 아니면 출력 토큰당(per 1M).
function priceLabel(m: ImageModel | null): string {
  if (!m) return "가격 정보 없음"
  if (m.per_image != null) return `$${m.per_image} / 장`
  if (m.output_per_m != null) return `$${m.output_per_m} / 1M`
  if (m.input_per_m != null) return `$${m.input_per_m} / 1M`
  return "가격 정보 없음"
}

// 호버/하단 요약용 상세 비용.
function priceDetail(m: ImageModel | null): string {
  if (!m) return "가격 정보 없음"
  if (m.per_image != null) return `장당 $${m.per_image}`
  const parts: string[] = []
  if (m.input_per_m != null) parts.push(`입력 $${m.input_per_m}`)
  if (m.output_per_m != null) parts.push(`출력 $${m.output_per_m}`)
  return parts.length ? `${parts.join(" · ")} (1M 토큰당)` : "가격 정보 없음"
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
  // modelChoice: "" (미선택/로딩) | 모델 ID | "custom"
  const [modelChoice, setModelChoice] = useState("")
  const [customModel, setCustomModel] = useState("")
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PortraitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ImageModel[]>([])
  const [defaultModel, setDefaultModel] = useState<string>("")
  const [modelsLoading, setModelsLoading] = useState(true)

  // 이미지 모델 목록 + 가격을 백엔드에서 조회(OpenRouter 무료 메타데이터).
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/dev/image-models`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { models: ImageModel[]; default: string } | null) => {
        if (cancelled || !data) return
        setModels(data.models)
        setDefaultModel(data.default)
        // 처음 로드되면 서버 기본 모델을 미리 선택.
        setModelChoice((prev) => prev || data.default)
      })
      .catch(() => {
        /* 목록 조회 실패해도 직접 입력으로 계속 사용 가능 */
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedModelId = modelChoice === "custom" ? customModel.trim() : modelChoice
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

  // 전송할 모델 ID: "custom"=customModel, 그 외=선택 ID(빈값이면 서버 기본).
  function resolveModel(): string | undefined {
    if (modelChoice === "custom") return customModel.trim() || undefined
    return modelChoice || undefined
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
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="size-3.5" /> 개발 도구
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">사진 → 인물 생성</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              얼굴 사진을 올리고 AI 모델을 골라 인물 이미지(2:3) 한 장을 생성합니다.
            </p>
          </div>
        </div>
      </header>

      {/* 1. 사진 + 프롬프트 */}
      <div className="grid gap-5 md:grid-cols-2">
        <Section step={1} title="사진" required>
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex h-full min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
            )}
          >
            <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            {photoBase64 ? (
              <>
                <Image
                  src={`data:image/png;base64,${photoBase64}`}
                  alt="업로드한 사진"
                  width={120}
                  height={120}
                  unoptimized
                  className="size-28 rounded-xl object-cover shadow-sm ring-1 ring-border"
                />
                <p className="text-sm font-medium text-emerald-600">
                  사진 준비됨 — 클릭/드래그로 교체
                </p>
              </>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <ImageUp className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  사진을 드래그하거나 클릭해서 선택
                </p>
              </>
            )}
          </label>
        </Section>

        <Section
          step={2}
          title="프롬프트"
          hint="기본값 = 카드 흐름 인물 프롬프트 · 편집 가능"
        >
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            className="h-full min-h-44 resize-none font-mono text-xs leading-relaxed"
            disabled={loading}
          />
        </Section>
      </div>

      {/* 2. 모델 선택 (메뉴 — 항목마다 가격 표시) */}
      <Section step={3} title="AI 모델" hint="장당 또는 1M 토큰당 단가" className="mt-5">
        <Select
          value={modelChoice}
          onValueChange={(v) => setModelChoice(v ?? "")}
          disabled={loading || modelsLoading}
        >
          <SelectTrigger className="h-auto py-2.5 [&>span]:flex [&>span]:w-full">
            <SelectValue>
              {(value: string | null) => {
                if (!value) {
                  return (
                    <span className="text-muted-foreground">
                      {modelsLoading ? "모델 불러오는 중…" : "모델 선택"}
                    </span>
                  )
                }
                if (value === "custom") {
                  return (
                    <span className="flex flex-col items-start gap-0.5 text-left">
                      <span className="text-sm font-semibold">직접 입력</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {customModel.trim() || "모델 ID를 입력하세요"}
                      </span>
                    </span>
                  )
                }
                const info = models.find((m) => m.id === value) ?? null
                return (
                  <span className="flex w-full items-center gap-2 text-left">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{info?.name ?? value}</span>
                        {value === defaultModel && (
                          <Badge variant="outline" className="shrink-0 px-1 text-[9px]">
                            기본
                          </Badge>
                        )}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {priceDetail(info)}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0 rounded-md bg-primary/10 px-2 py-1 font-mono text-sm font-semibold text-primary">
                      {priceLabel(info)}
                    </span>
                  </span>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="py-2">
                <span className="flex w-full items-center gap-2 pr-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {m.name}
                    {m.id === defaultModel && (
                      <Badge variant="outline" className="px-1 text-[9px]">
                        기본
                      </Badge>
                    )}
                  </span>
                  <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                    {priceLabel(m)}
                  </span>
                </span>
              </SelectItem>
            ))}
            <SelectItem value="custom" className="py-2 text-sm">
              직접 입력…
            </SelectItem>
          </SelectContent>
        </Select>

        {modelChoice === "custom" && (
          <Input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="모델 ID 입력 (예: openai/gpt-5-image)"
            disabled={loading}
            className="mt-3 font-mono text-xs"
            autoFocus
          />
        )}
      </Section>

      {/* 3. 생성 바 */}
      <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">선택 모델</span>
            <span className="truncate font-medium">
              {selectedInfo?.name ?? selectedModelId ?? "—"}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {selectedModelId
              ? priceDetail(selectedInfo)
              : "모델 ID를 입력하세요"}
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading || !photoBase64}
          size="lg"
          className="shrink-0"
        >
          <Sparkles className="size-4" />
          {loading ? "생성 중…" : "인물 생성"}
        </Button>
      </div>

      {error && (
        <Card className="mt-5 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-sm text-destructive">
              <div className="mb-1 font-semibold">오류</div>
              <div className="font-mono text-xs whitespace-pre-wrap break-all">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. 결과 */}
      {(result || loading) && (
        <div className="mt-6">
          <div className="mb-3 text-sm font-semibold">생성 결과</div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border shadow-sm bg-muted/30">
              <div className="relative w-full" style={{ aspectRatio: "2 / 3" }}>
                {result ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${result.image_base64}`}
                    alt="생성된 인물"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <Skeleton className="absolute inset-0 h-full w-full" />
                )}
              </div>
            </div>

            {result && (
              <div className="w-full flex-1 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Meta label="모델" value={result.model} />
                  <Meta label="시간" value={`${result.elapsed_seconds}s`} />
                  <Meta label="크기" value={`${(result.size_bytes / 1024).toFixed(0)} KB`} />
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="size-4" /> PNG 다운로드
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  step,
  title,
  hint,
  required,
  className,
  children,
}: {
  step: number
  title: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-3 pt-6">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {step}
          </span>
          <span className="text-sm font-semibold">{title}</span>
          {required && (
            <Badge variant="secondary" className="text-[10px]">
              필수
            </Badge>
          )}
          {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono break-all">{value}</div>
    </div>
  )
}
