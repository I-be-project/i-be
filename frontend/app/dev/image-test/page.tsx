"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ImageTarget = "id_photo" | "card_background"

interface GenerateImageResponse {
  image_base64: string
  size_bytes: number
  elapsed_seconds: number
  model: string
  size: string
  target: ImageTarget
  prompt: string
}

interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const PORTRAIT_PRESETS = [
  "A confident young Korean adult in their late 20s, future drone pilot in tactical outdoor wear, soft forest morning light, anime-style illustrated portrait, looking at camera, neutral pastel background",
  "A thoughtful young Korean adult, space biologist in a clean lab coat, calm lighting, illustrated portrait, futuristic eyewear, plain studio background",
  "A bright young Korean adult, data detective with holographic AR glasses, neo-Seoul style, illustrated portrait, navy backdrop",
]

const BACKGROUND_PRESETS = [
  "A misty Korean pine forest at dawn, drones hovering between trees, soft cinematic light, painterly illustration, no people, wide aspect, gentle gradient sky",
  "A futuristic Mars greenhouse with glowing alien plants, soft teal lighting, painterly illustration, no people, wide horizontal composition",
  "A neo-Seoul rooftop at sunset, holographic city map projection, painterly illustration, no people, warm sky gradient, wide horizontal",
]

export default function ImageTestPage() {
  const [portraitPrompt, setPortraitPrompt] = useState("")
  const [backgroundPrompt, setBackgroundPrompt] = useState("")
  const [loadingPortrait, setLoadingPortrait] = useState(false)
  const [loadingBackground, setLoadingBackground] = useState(false)
  const [portrait, setPortrait] = useState<GenerateImageResponse | null>(null)
  const [background, setBackground] = useState<GenerateImageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadingAny = loadingPortrait || loadingBackground

  const generate = async (
    target: ImageTarget,
    prompt: string,
  ): Promise<GenerateImageResponse> => {
    const res = await fetch(`${API_URL}/api/dev/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, target }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as ApiError | null
      const msg = data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`
      const details = data?.error?.details
      const detailsStr = details ? `\n${JSON.stringify(details, null, 2)}` : ""
      throw new Error(`[${target}] ${msg}${detailsStr}`)
    }
    return (await res.json()) as GenerateImageResponse
  }

  const handleGenerateBoth = async () => {
    if (!portraitPrompt.trim() || !backgroundPrompt.trim()) {
      setError("두 프롬프트 모두 입력해주세요")
      return
    }
    setError(null)
    setPortrait(null)
    setBackground(null)
    setLoadingPortrait(true)
    setLoadingBackground(true)

    const portraitTask = generate("id_photo", portraitPrompt)
      .then((data) => {
        setPortrait(data)
        return data
      })
      .finally(() => setLoadingPortrait(false))

    const backgroundTask = generate("card_background", backgroundPrompt)
      .then((data) => {
        setBackground(data)
        return data
      })
      .finally(() => setLoadingBackground(false))

    const [p, b] = await Promise.allSettled([portraitTask, backgroundTask])
    const errors = [p, b]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    if (errors.length > 0) setError(errors.join("\n"))
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <Badge variant="secondary" className="mb-3">
          dev
        </Badge>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          카드 이미지 생성 테스트
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          포트레이트(증명사진 2:3)와 카드 배경(3:2)을 동시에 생성합니다. 백엔드{" "}
          <code className="font-mono text-xs">POST /api/dev/image</code> 직접 호출.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <PromptCard
          title="포트레이트 (증명사진)"
          description="카드 안의 인물 — 2:3 비율, 1024×1536"
          prompt={portraitPrompt}
          setPrompt={setPortraitPrompt}
          presets={PORTRAIT_PRESETS}
          disabled={loadingAny}
        />
        <PromptCard
          title="카드 배경 (신용카드 비율)"
          description="카드 전체 배경 — 3:2 비율, 1536×1024"
          prompt={backgroundPrompt}
          setPrompt={setBackgroundPrompt}
          presets={BACKGROUND_PRESETS}
          disabled={loadingAny}
        />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="text-xs text-muted-foreground">
          API: <code className="font-mono">{API_URL}</code>
        </div>
        <Button
          onClick={handleGenerateBoth}
          disabled={loadingAny || !portraitPrompt.trim() || !backgroundPrompt.trim()}
          size="lg"
        >
          {loadingAny ? "생성 중..." : "두 이미지 생성"}
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-sm text-destructive">
              <div className="font-semibold mb-1">오류</div>
              <div className="font-mono text-xs whitespace-pre-wrap break-all">
                {error}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 카드 미리보기 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="mb-4 text-sm font-medium text-muted-foreground">
            카드 미리보기 (신용카드 비율 — 1.586:1)
          </div>
          <CardPreview
            portrait={portrait}
            background={background}
            loadingPortrait={loadingPortrait}
            loadingBackground={loadingBackground}
          />
        </CardContent>
      </Card>

      {/* 각 이미지 메타 + 단독 보기 */}
      <div className="grid gap-6 md:grid-cols-2">
        <ResultCard
          title="포트레이트 (1024×1536)"
          data={portrait}
          loading={loadingPortrait}
        />
        <ResultCard
          title="카드 배경 (1536×1024)"
          data={background}
          loading={loadingBackground}
        />
      </div>
    </div>
  )
}

function PromptCard({
  title,
  description,
  prompt,
  setPrompt,
  presets,
  disabled,
}: {
  title: string
  description: string
  prompt: string
  setPrompt: (p: string) => void
  presets: string[]
  disabled: boolean
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="설명을 입력하세요..."
          rows={6}
          className="font-mono text-xs"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(p)}
              disabled={disabled}
              className="text-xs rounded-md border bg-muted/50 px-2 py-1 hover:bg-muted transition disabled:opacity-50"
            >
              프리셋 {i + 1}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CardPreview({
  portrait,
  background,
  loadingPortrait,
  loadingBackground,
}: {
  portrait: GenerateImageResponse | null
  background: GenerateImageResponse | null
  loadingPortrait: boolean
  loadingBackground: boolean
}) {
  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-xl border shadow-md bg-muted/30">
      {/* 신용카드 비율 컨테이너 */}
      <div className="relative w-full" style={{ aspectRatio: "1.586 / 1" }}>
        {/* 배경 */}
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${background.image_base64}`}
            alt="background"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : loadingBackground ? (
          <Skeleton className="absolute inset-0 w-full h-full" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center text-xs text-muted-foreground">
            배경 자리
          </div>
        )}

        {/* 오버레이: 어두운 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/20" />

        {/* 포트레이트 */}
        <div className="absolute left-[4%] top-[12%] bottom-[12%] aspect-[2/3]">
          <div className="w-full h-full rounded-md overflow-hidden border-2 border-white/80 shadow-lg bg-muted">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${portrait.image_base64}`}
                alt="portrait"
                className="w-full h-full object-cover"
              />
            ) : loadingPortrait ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                포트레이트
              </div>
            )}
          </div>
        </div>

        {/* 텍스트 자리 (목업) */}
        <div className="absolute left-[30%] top-[18%] right-[10%] text-white drop-shadow-lg">
          <div className="text-[10px] md:text-xs opacity-80 mb-1">
            나Be한마당 페르소나
          </div>
          <div className="text-lg md:text-2xl font-bold">페르소나 타이틀</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {["#키워드1", "#키워드2", "#키워드3"].map((k) => (
              <span
                key={k}
                className="text-[9px] md:text-[10px] bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5"
              >
                {k}
              </span>
            ))}
          </div>
        </div>

        {/* QR 자리 */}
        <div className="absolute right-[4%] bottom-[8%] w-[14%] aspect-square bg-white/90 rounded flex items-center justify-center text-[8px] text-muted-foreground">
          QR
        </div>
      </div>
    </div>
  )
}

function ResultCard({
  title,
  data,
  loading,
}: {
  title: string
  data: GenerateImageResponse | null
  loading: boolean
}) {
  const handleDownload = () => {
    if (!data) return
    const link = document.createElement("a")
    link.href = `data:image/png;base64,${data.image_base64}`
    link.download = `nabe-${data.target}-${Date.now()}.png`
    link.click()
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="text-sm font-semibold">{title}</div>
        <div
          className={cn(
            "overflow-hidden rounded-md border bg-muted/30 mx-auto",
            data?.target === "id_photo" || (!data && title.includes("포트레이트"))
              ? "max-w-[200px]"
              : "max-w-full",
          )}
          style={{
            aspectRatio:
              data?.target === "id_photo" || (!data && title.includes("포트레이트"))
                ? "2 / 3"
                : "3 / 2",
          }}
        >
          {data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${data.image_base64}`}
              alt={data.prompt}
              className="w-full h-full object-cover"
            />
          ) : loading ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              생성 전
            </div>
          )}
        </div>

        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Meta label="크기" value={`${(data.size_bytes / 1024).toFixed(0)} KB`} />
              <Meta label="시간" value={`${data.elapsed_seconds}s`} />
              <Meta label="해상도" value={data.size} />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                PNG 다운로드
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono">{value}</div>
    </div>
  )
}
