"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface GenerateCardResponse {
  image_base64: string
  size_bytes: number
  width: number
  height: number
  elapsed_seconds: number
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

export default function CardTestPage() {
  const [portraitPrompt, setPortraitPrompt] = useState("")
  const [backgroundPrompt, setBackgroundPrompt] = useState("")
  const [title, setTitle] = useState("숲을 지키는 드론 전문가")
  const [tagline, setTagline] = useState(
    "자연과 기술을 함께 활용해 생태를 지키는 미래형 탐사 역할",
  )
  const [keywords, setKeywords] = useState("자연, 드론, 탐사, 기술, 보호")
  const [qrData, setQrData] = useState("https://ibe.example/c/demo")
  const [loading, setLoading] = useState(false)
  const [card, setCard] = useState<GenerateCardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!portraitPrompt.trim() || !backgroundPrompt.trim()) {
      setError("인물·배경 프롬프트를 모두 입력해주세요")
      return
    }
    if (!title.trim()) {
      setError("페르소나 타이틀을 입력해주세요")
      return
    }
    setError(null)
    setCard(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/dev/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portrait_prompt: portraitPrompt,
          background_prompt: backgroundPrompt,
          title,
          tagline,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          qr_data: qrData,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null
        const msg = data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`
        const details = data?.error?.details
        const detailsStr = details ? `\n${JSON.stringify(details, null, 2)}` : ""
        throw new Error(`${msg}${detailsStr}`)
      }
      setCard((await res.json()) as GenerateCardResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!card) return
    const link = document.createElement("a")
    link.href = `data:image/png;base64,${card.image_base64}`
    link.download = `ibe-card-${Date.now()}.png`
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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          페르소나 카드 생성 테스트
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          백엔드{" "}
          <code className="font-mono text-xs">POST /api/dev/card</code> — 인물·배경
          그림 2장을 생성하고 글자·QR까지 합성한 <b>완성 카드 한 장</b>을 반환합니다.
        </p>
      </header>

      {/* 그림 프롬프트 */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <PromptCard
          title="인물 프롬프트"
          description="카드 속 인물 (2:3) — 영문 권장"
          prompt={portraitPrompt}
          setPrompt={setPortraitPrompt}
          presets={PORTRAIT_PRESETS}
          disabled={loading}
        />
        <PromptCard
          title="배경 프롬프트"
          description="카드 배경 (3:2) — 영문 권장"
          prompt={backgroundPrompt}
          setPrompt={setBackgroundPrompt}
          presets={BACKGROUND_PRESETS}
          disabled={loading}
        />
      </div>

      {/* 페르소나 정보 */}
      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <Field label="페르소나 타이틀 (이름/직업)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 숲을 지키는 드론 전문가"
              disabled={loading}
            />
          </Field>
          <Field label="QR 데이터 (공유 링크/토큰)">
            <Input
              value={qrData}
              onChange={(e) => setQrData(e.target.value)}
              placeholder="https://..."
              disabled={loading}
              className="font-mono text-xs"
            />
          </Field>
          <Field label="한 줄 소개 (선택)" className="md:col-span-2">
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="역할을 한 문장으로"
              disabled={loading}
            />
          </Field>
          <Field label="키워드 (쉼표로 구분, 3~5개 권장)" className="md:col-span-2">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="자연, 드론, 탐사"
              disabled={loading}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-6">
        <div className="text-xs text-muted-foreground">
          API: <code className="font-mono">{API_URL}</code>
        </div>
        <Button onClick={handleGenerate} disabled={loading} size="lg">
          {loading ? "생성 중..." : "카드 생성"}
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

      {/* 완성 카드 */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 text-sm font-medium text-muted-foreground">
            완성 카드 (백엔드 합성 결과)
          </div>
          <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-xl border shadow-md bg-muted/30">
            <div className="relative w-full" style={{ aspectRatio: "1.586 / 1" }}>
              {card ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${card.image_base64}`}
                  alt="페르소나 카드"
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

          {card && (
            <div className="mt-4 flex items-center justify-between">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Meta label="크기" value={`${(card.size_bytes / 1024).toFixed(0)} KB`} />
                <Meta label="시간" value={`${card.elapsed_seconds}s`} />
                <Meta label="해상도" value={`${card.width}×${card.height}`} />
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

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono">{value}</div>
    </div>
  )
}
