"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2, RefreshCw, Save } from "lucide-react"
import { StudentPicker } from "@/app/dev/_components/student-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { draftAction, getStudentDraft, previewDraftCard, type DevStudent, type Draft } from "@/lib/devApi"

export default function CardRegeneratePage() {
  const [student, setStudent] = useState<DevStudent | null>(null)
  const [loaded, setLoaded] = useState<{ studentId: string; draft: Draft; card: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ studentId: string; message: string; failed: boolean } | null>(null)
  const current = loaded?.studentId === student?.id ? loaded : null
  const message = feedback?.studentId === student?.id ? feedback : null

  useEffect(() => {
    if (!student) return
    let alive = true
    async function load() {
      setLoading(true)
      setFeedback(null)
      try {
        const draft = await getStudentDraft(student!.id)
        const preview = await previewDraftCard(draft.id)
        if (alive) setLoaded({ studentId: student!.id, draft, card: preview.image_base64 })
      } catch (error) {
        if (alive) setFeedback({ studentId: student!.id, message: error instanceof Error ? error.message : "카드를 불러오지 못했습니다.", failed: true })
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [student])

  async function run(action: "regenerate-image" | "approve") {
    if (!current || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const draft = await draftAction(current.draft.id, action)
      const preview = await previewDraftCard(draft.id)
      setLoaded({ studentId: current.studentId, draft, card: preview.image_base64 })
      setFeedback({ studentId: current.studentId, message: draft.error ?? (action === "approve" ? "카드를 저장했습니다. 학생 화면에도 반영됩니다." : "이미지를 다시 만들었습니다. 미리보기를 확인한 뒤 카드를 저장해 주세요."), failed: Boolean(draft.error) })
    } catch (error) {
      setFeedback({ studentId: current.studentId, message: error instanceof Error ? error.message : "요청에 실패했습니다.", failed: true })
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!current || !student) return
    const link = document.createElement("a")
    link.href = `data:image/png;base64,${current.card}`
    link.download = `${student.name}-페르소나-카드.png`
    link.click()
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Link href="/dev" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> 개발 도구</Link>
      <header className="mb-6">
        <Badge variant="secondary" className="mb-2">codex exec · 카드</Badge>
        <h1 className="text-2xl font-bold tracking-tight">카드 재생성</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">기존 카드 문구를 유지하며 인물 이미지를 다시 만듭니다. 미리보기를 확인한 뒤 저장하면 학생의 카드에 반영됩니다.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <fieldset disabled={busy} className="min-w-0">
            <legend className="mb-2 text-sm font-medium">학생 선택</legend>
            <StudentPicker requires="photo" selected={student} onSelect={setStudent} />
          </fieldset>
          <Button disabled={!current || loading || busy} onClick={() => void run("regenerate-image")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {busy ? "처리 중…" : "Codex로 이미지 재생성"}
          </Button>
          <Button variant="outline" disabled={!current || loading || busy || Boolean(current.draft.error)} onClick={() => void run("approve")}><Save className="size-4" /> 카드 저장 · 학생 화면 반영</Button>
          {message && <p role={message.failed ? "alert" : "status"} className={`text-sm ${message.failed ? "text-destructive" : "text-muted-foreground"}`}>{message.message}</p>}
          {message?.failed && !current && <Link href="/dev/review" className="text-sm underline">페르소나 카드 검수로 이동</Link>}
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <h2 className="self-start text-sm font-medium">{student ? `${student.name} · 카드 미리보기` : "카드 미리보기"}</h2>
            {loading ? <p role="status" className="flex min-h-64 items-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> 카드를 불러오는 중…</p> : current ? <>
              {/* eslint-disable-next-line @next/next/no-img-element -- 합성 카드의 data URL 미리보기 */}
              <img src={`data:image/png;base64,${current.card}`} alt={`${student?.name}의 페르소나 카드`} className="h-auto w-full max-w-md rounded-lg" />
              <Button variant="outline" disabled={busy} onClick={download}><Download className="size-4" /> 미리보기 다운로드</Button>
            </> : <p className="flex min-h-64 items-center text-sm text-muted-foreground">{student ? "재생성할 카드를 불러오지 못했습니다." : "학생을 선택하면 기존 카드가 표시됩니다."}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
