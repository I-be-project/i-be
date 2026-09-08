"use client"

// 학생 선택 → DB에 저장된 사진 + 편집한 프롬프트 → 10년 뒤 모습 생성.
// 사진은 서버가 S3에서 직접 읽어 codex에 첨부한다(업로드 UI 없음).
//
// 결과는 저장하지 않는다 — 새로고침하면 사라진다. 원본과의 대조는 항상 되지만
// 실행 간(프롬프트 A vs B) 비교는 화면을 벗어나지 않는 선에서만 가능하다.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, Download, HardDrive, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { StudentPicker } from "@/app/dev/_components/student-picker"
import {
  generateFuturePhoto,
  getDefaultPrompts,
  type DevStudent,
  type FuturePhotoResult,
} from "@/lib/devApi"

function download(src: string, name?: string): void {
  const link = document.createElement("a")
  link.href = src
  link.download = `future-${name ?? "photo"}.png`
  link.click()
}

export default function DevFuturePhotoPage() {
  const [student, setStudent] = useState<DevStudent | null>(null)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FuturePhotoResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDefaultPrompts()
      .then((p) => setPrompt(p.future_photo_prompt))
      .catch((e: Error) => setError(e.message))
  }, [])

  const run = async () => {
    if (!student) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await generateFuturePhoto({ student_id: student.id, prompt }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/dev"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 개발 도구
      </Link>

      <header className="mb-6">
        <Badge variant="secondary" className="mb-2">
          codex · 이미지
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">10년 뒤 사진 생성</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          학생의 저장된 사진을 입력으로 10년 뒤 모습을 만듭니다. 사진이 없는 학생은
          고를 수 없고, 결과는 저장되지 않습니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">1. 학생 선택</label>
            <StudentPicker
              requires="photo"
              selected={student}
              onSelect={(s) => {
                setStudent(s)
                setResult(null)
              }}
            />
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor="prompt" className="text-sm font-medium">
              2. 프롬프트
            </label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-40 text-sm"
            />
          </section>

          <Button onClick={run} disabled={!student || loading || !prompt}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 생성 중… (1분 이상)
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> {result ? "다시 생성" : "사진 생성"}
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <Comparison student={student} result={result} loading={loading} />
      </div>
    </div>
  )
}

// 원본과 결과를 항상 같은 자리에 나란히 둔다 — 생성 전에도 원본은 보인다.
function Comparison({
  student,
  result,
  loading,
}: {
  student: DevStudent | null
  result: FuturePhotoResult | null
  loading: boolean
}) {
  if (!student) {
    return (
      <Card className="flex min-h-96 items-center justify-center border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          학생을 고르면 원본 사진이 여기 표시됩니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Pane label="원본" sublabel={student.name}>
          {student.photo_url ? (
            // S3 Presigned URL은 next/image remotePatterns에 없다 —
            // 코드베이스 관례(console/StudentListView)대로 <img>를 쓴다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.photo_url}
              alt={`${student.name}의 원본 사진`}
              className="size-full object-cover"
            />
          ) : (
            <Empty>사진 URL을 받지 못했습니다.</Empty>
          )}
        </Pane>

        <Pane
          label="10년 뒤"
          sublabel={result ? `${result.width}×${result.height}` : undefined}
        >
          {loading ? (
            <Empty>
              <Loader2 className="mb-2 size-6 animate-spin" />
              codex가 만드는 중…
            </Empty>
          ) : result ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${result.image_base64}`}
              alt={`${student.name}의 10년 뒤 모습`}
              className="size-full object-cover"
            />
          ) : (
            <Empty>아직 생성하지 않았습니다.</Empty>
          )}
        </Pane>
      </div>

      {result && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" /> {result.elapsed_seconds}초
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="size-3.5" />
            {(result.size_bytes / 1024 / 1024).toFixed(2)} MB
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(`data:image/png;base64,${result.image_base64}`, student.name)
            }
          >
            <Download className="size-4" /> 다운로드
          </Button>
        </div>
      )}
    </div>
  )
}

function Pane({
  label,
  sublabel,
  children,
}: {
  label: string
  sublabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </div>
      {/* 두 칸을 증명사진 비율(2:3)로 고정 — 좌우 높이가 어긋나면 비교가 어렵다. */}
      <div className="flex aspect-2/3 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {children}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
