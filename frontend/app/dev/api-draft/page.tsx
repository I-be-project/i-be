"use client"

// 학생 선택 → API로 초안 한 건 생성: 페르소나(OpenRouter) + 10년 뒤 사진(Vertex AI) + 카드 미리보기.
// 프롬프트·입력은 검수 초안(codex)과 같다. 결과는 저장하지 않는다 — 새로고침하면 사라진다.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, DollarSign, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AnswerPreview } from "@/app/dev/_components/answer-preview"
import { StudentPicker } from "@/app/dev/_components/student-picker"
import {
  generateApiDraft,
  getStudentAnswers,
  type ApiDraftResult,
  type DevStudent,
  type StudentAnswers,
} from "@/lib/devApi"

// 화면 표시용 환율 — 대략치.
const KRW_PER_USD = 1400

const PERSONA_LABELS: [keyof NonNullable<ApiDraftResult["persona"]>, string][] = [
  ["persona_anchor", "수식어"],
  ["target", "대상"],
  ["desired_impact", "만들고 싶은 변화"],
  ["value_attitude", "가치·태도"],
  ["problem_solving", "문제 해결 방식"],
  ["career_reason", "이 직업인 이유"],
]

function cost(usd: number | null): string {
  return usd === null ? "비용 정보 없음" : `$${usd.toFixed(4)} (≈₩${Math.round(usd * KRW_PER_USD)})`
}

export default function DevApiDraftPage() {
  const [student, setStudent] = useState<DevStudent | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiDraftResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<StudentAnswers | null>(null)

  // 학생을 고르면 생성 입력(설문 답변)을 미리 보여준다.
  useEffect(() => {
    if (!student) return
    let cancelled = false
    getStudentAnswers(student.id)
      .then((a) => !cancelled && setAnswers(a))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [student])

  const run = async () => {
    if (!student) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await generateApiDraft(student.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const total =
    result && (result.persona_cost_usd !== null || result.image_cost_usd !== null)
      ? (result.persona_cost_usd ?? 0) + (result.image_cost_usd ?? 0)
      : null

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
          OpenRouter + Vertex AI
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">API 초안 생성</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          학생 한 명의 페르소나와 10년 뒤 사진을 API로 만들어 카드로 미리 봅니다. 검수 초안과
          같은 프롬프트를 쓰고, 결과는 저장하지 않습니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">학생 선택</label>
            <StudentPicker
              requires="answers"
              selected={student}
              onSelect={(s) => {
                setStudent(s)
                setAnswers(null)
                setResult(null)
              }}
            />
            {student && !student.has_photo && (
              <p className="text-xs text-muted-foreground">
                사진이 없는 학생이라 카드는 폴백 캐릭터로 만듭니다.
              </p>
            )}
          </section>

          <Button onClick={run} disabled={!student || loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 생성 중… (약 30초)
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> {result ? "다시 생성" : "초안 생성"}
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {result && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6 text-xs">
                <Usage
                  label="페르소나"
                  model={result.persona_model}
                  seconds={result.persona_seconds}
                  usd={result.persona_cost_usd}
                />
                <Usage
                  label="이미지"
                  model={result.image_model}
                  seconds={result.image_seconds}
                  usd={result.image_cost_usd}
                />
                <div className="flex justify-between border-t pt-3 font-medium">
                  <span>합계</span>
                  <span>{cost(total)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {student && <StudentInputs student={student} answers={answers} />}
          <Result student={student} result={result} loading={loading} />
        </div>
      </div>
    </div>
  )
}

// 생성 입력 — 원본 사진과 설문 답변. 결과와 나란히 두고 대조한다.
function StudentInputs({
  student,
  answers,
}: {
  student: DevStudent
  answers: StudentAnswers | null
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">올린 사진</span>
        <div className="flex aspect-4/5 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
          {student.photo_url ? (
            // S3 Presigned URL은 next/image remotePatterns에 없다 — 코드베이스 관례대로 <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.photo_url}
              alt={`${student.name}의 원본 사진`}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">사진 없음</span>
          )}
        </div>
      </div>
      <AnswerPreview student={student} answers={answers} />
    </div>
  )
}

function Usage({
  label,
  model,
  seconds,
  usd,
}: {
  label: string
  model: string
  seconds: number
  usd: number | null
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{model}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" /> {seconds}초
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="size-3.5" /> {cost(usd)}
        </span>
      </div>
    </div>
  )
}

function Result({
  student,
  result,
  loading,
}: {
  student: DevStudent | null
  result: ApiDraftResult | null
  loading: boolean
}) {
  if (!student || (!result && !loading)) {
    return (
      <Card className="flex min-h-48 items-center justify-center border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {student ? "초안 생성을 누르면 결과가 여기 표시됩니다." : "학생을 고르세요."}
        </CardContent>
      </Card>
    )
  }
  if (loading || !result) {
    return (
      <Card className="flex min-h-96 items-center justify-center">
        <CardContent className="flex flex-col items-center gap-2 pt-6 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          페르소나와 사진을 동시에 만드는 중…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">카드 미리보기</span>
        {result.card_base64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${result.card_base64}`}
            alt={`${student.name}의 카드 미리보기`}
            className="w-full rounded-lg border"
          />
        ) : (
          <p className="text-sm text-muted-foreground">페르소나가 없어 카드를 만들지 못했습니다.</p>
        )}
        {result.image_error && (
          <p className="text-xs text-destructive">이미지 실패: {result.image_error}</p>
        )}
        <p className="text-xs text-muted-foreground">QR은 미리보기용 예시 코드입니다.</p>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-sm font-medium">페르소나</span>
        {result.persona ? (
          <>
            <div>
              <p className="text-lg font-bold">{result.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{result.tagline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.persona.career_required_competencies.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              {PERSONA_LABELS.map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5">{String(result.persona?.[key] ?? "")}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-sm text-destructive">페르소나 실패: {result.persona_error}</p>
        )}
      </div>
    </div>
  )
}
