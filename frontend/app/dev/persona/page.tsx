"use client"

// 학생 선택 → 저장된 설문 답변 + 편집한 시스템 프롬프트 → Career Persona 생성.
// 이미지는 만들지 않는다(텍스트 전용). 백엔드는 로컬 codex CLI로 실행한다.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StudentPicker } from "@/app/dev/_components/student-picker"
import {
  generatePersona,
  getDefaultPrompts,
  getStudentAnswers,
  type DevStudent,
  type PersonaResult,
  type StudentAnswers,
} from "@/lib/devApi"

// 규칙 v1의 1순위 근거지만 DB에 저장되지 않는다(프론트 Q7-B 응답에만 존재).
// 여기서 직접 넣어 결과가 어떻게 달라지는지 본다.
const CAREER_POOL_PLACEHOLDER = "UX 디자이너, 서비스 기획자, 데이터 분석가"

export default function DevPersonaPage() {
  const [student, setStudent] = useState<DevStudent | null>(null)
  const [answers, setAnswers] = useState<StudentAnswers | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [careerPoolText, setCareerPoolText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PersonaResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 기본 시스템 프롬프트는 백엔드가 들고 있다(규칙 v1 11장) — 화면에서 편집만 한다.
  useEffect(() => {
    getDefaultPrompts()
      .then((p) => setSystemPrompt(p.persona_system_prompt))
      .catch((e: Error) => setError(e.message))
  }, [])

  // 학생을 고르면 그 학생의 최근 세션 답변을 미리 보여준다.
  useEffect(() => {
    if (!student) return
    setAnswers(null)
    setResult(null)
    getStudentAnswers(student.id)
      .then(setAnswers)
      .catch((e: Error) => setError(e.message))
  }, [student])

  const run = async () => {
    if (!student) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(
        await generatePersona({
          student_id: student.id,
          system_prompt: systemPrompt,
          career_pool: careerPoolText
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        }),
      )
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
          codex · 텍스트
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">페르소나 생성</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          학생의 저장된 설문 답변과 편집한 시스템 프롬프트로 Career Persona 하나를
          만듭니다. 이미지는 만들지 않습니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium">1. 학생 선택</label>
            <StudentPicker
              requires="answers"
              selected={student}
              onSelect={setStudent}
            />
          </section>

          {student && (
            <AnswerPreview student={student} answers={answers} />
          )}

          <section className="flex flex-col gap-2">
            <label htmlFor="career-pool" className="text-sm font-medium">
              2. Career Pool{" "}
              <span className="font-normal text-muted-foreground">
                (쉼표 구분 · DB에 저장되지 않아 직접 입력)
              </span>
            </label>
            <Input
              id="career-pool"
              value={careerPoolText}
              onChange={(e) => setCareerPoolText(e.target.value)}
              placeholder={CAREER_POOL_PLACEHOLDER}
            />
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor="system-prompt" className="text-sm font-medium">3. 시스템 프롬프트</label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-64 font-mono text-xs"
            />
          </section>

          <Button onClick={run} disabled={!student || loading || !systemPrompt}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 생성 중… (30초 이상)
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> 페르소나 생성
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <ResultPanel result={result} loading={loading} />
      </div>
    </div>
  )
}

function AnswerPreview({
  student,
  answers,
}: {
  student: DevStudent
  answers: StudentAnswers | null
}) {
  if (!answers) {
    return (
      <p className="text-sm text-muted-foreground">
        {student.name}의 답변을 불러오는 중…
      </p>
    )
  }
  const rows: [string, string | null][] = [
    ["Pair Code", answers.pair_code || null],
    [
      "RIASEC",
      Object.keys(answers.riasec_scores).length
        ? Object.entries(answers.riasec_scores)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")
        : null,
    ],
    ["Q7 공간", answers.q7a_first],
    ["Q7 도구", answers.q7b_first],
    ["Q8 방식", answers.q8_response],
    ["Q9 대상", answers.q9_response],
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium">{student.name}의 답변</span>
          {answers.status && (
            <Badge variant="outline" className="text-xs">
              {answers.status}
            </Badge>
          )}
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">
              {label}
            </span>
            <span className={value ? "" : "text-muted-foreground"}>
              {value ?? "(없음)"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ResultPanel({
  result,
  loading,
}: {
  result: PersonaResult | null
  loading: boolean
}) {
  if (loading) {
    return (
      <Card className="flex min-h-64 items-center justify-center">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          codex 실행 중…
        </CardContent>
      </Card>
    )
  }
  if (!result) {
    return (
      <Card className="flex min-h-64 items-center justify-center border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          학생을 고르고 생성을 누르면 결과가 여기 표시됩니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {result.elapsed_seconds}초
          </div>
          <h2 className="text-xl font-bold leading-snug">{result.persona_name}</h2>
          <Badge variant="secondary" className="w-fit">
            {result.base_career}
          </Badge>
          <p className="text-sm leading-relaxed">{result.short_description}</p>
        </CardContent>
      </Card>

      {/* 규칙 v1 13장 — 학생에게 보여주지 않는 QA·추적용 내부 데이터 */}
      <Card>
        <CardContent className="flex flex-col gap-2 pt-5 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            QA 내부 데이터 (학생 비노출)
          </div>
          {(
            [
              ["Career Pool 내", result.source_career_pool ? "예" : "아니오"],
              ["인접 확장", result.pool_extended ? "예" : "아니오"],
              ["Q8 반영", result.q8_reflection],
              ["Q9 반영", result.q9_reflection],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {label}
              </span>
              <span>{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          codex에 보낸 user 프롬프트
        </summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {result.user_prompt}
        </pre>
      </details>
    </div>
  )
}
