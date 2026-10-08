"use client"

// 페르소나·카드 검수 — scripts/batch_drafts.py가 만든 초안을 한 명씩 보고 확정한다.
// 원본 사진 ↔ 생성 이미지 ↔ 합성 카드를 나란히 두고, 카드 문구를 고치거나
// 텍스트/이미지를 따로 재생성한 뒤 승인한다. 승인하면 카드 PNG가 S3에 저장되고
// generated.personas·cards에 확정된다(학생 화면·인쇄는 확정본만 읽는다).

import { Fragment, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, ChevronRight, ImageIcon, Loader2, RefreshCw, Save, Smile, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteDrafts,
  draftAction,
  listClasses,
  listDraftIssues,
  listDrafts,
  listSchools,
  previewDraftCard,
  regenerateImages,
  regenerateReview,
  setDraftVerdict,
  updateDraft,
  type Draft,
  type DraftEdit,
  type DevClass,
  type DraftIssue,
  type Verdict,
  type DraftScope,
  type DraftStatus,
} from "@/lib/devApi"
import { classLabel, schoolLabel } from "@/lib/api"
import { BatchPanel } from "./batch-panel"

const STATUS_LABEL: Record<DraftStatus, string> = {
  pending: "검수 대기",
  approved: "승인",
  rejected: "반려",
}

// 재생성 대상 모드의 탭. 전체 학교에서 모아 본다.
const ISSUE_LABEL: Record<DraftIssue, string> = {
  codex_failed: "codex 실패",
  codex_refused: "codex 거절 (사진 문제)",
  triangle: "△ 평가",
  regenerated: "재생성 → 재검수",
}

const VERDICT_MARK: Record<Verdict, string> = { o: "O", triangle: "△", x: "X" }

const toEdit = (d: Draft): DraftEdit => ({
  name: d.name,
  base_career: d.base_career,
  headline: d.headline,
  tagline: d.tagline,
  note: d.note,
})

export default function DevReviewPage() {
  const [filter, setFilter] = useState<DraftStatus | undefined>("pending")
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [counts, setCounts] = useState<Record<DraftStatus, number> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edit, setEdit] = useState<DraftEdit | null>(null)
  const [card, setCard] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 목록 체크박스(일괄 삭제용). 상세에 띄운 초안(selectedId)과는 별개다.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  // 학교 → 학년 → 반 순으로 눌러 들어간다. 반까지 골라야 학생 목록을 불러온다.
  const [scope, setScope] = useState<DraftScope>({})
  const [schools, setSchools] = useState<string[]>([])
  const [classes, setClasses] = useState<DevClass[]>([])
  // null이면 반별 검수, 값이 있으면 그 분류의 재생성 대상을 전체 학교에서 모아 본다.
  const [issue, setIssue] = useState<DraftIssue | null>(null)
  const [issueCounts, setIssueCounts] = useState<Record<DraftIssue, number> | null>(null)
  const [regenConcurrency, setRegenConcurrency] = useState(20)
  // 상세의 △ 이유 입력값.
  const [verdictReason, setVerdictReason] = useState("")

  const selected = drafts.find((d) => d.id === selectedId) ?? null

  const load = useCallback(async () => {
    setError(null)
    if (issue) {
      try {
        const res = await listDraftIssues(issue)
        setDrafts(res.drafts)
        setIssueCounts(res.counts)
        setSelectedId((cur) =>
          cur && res.drafts.some((d) => d.id === cur) ? cur : (res.drafts[0]?.id ?? null)
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.")
      }
      return
    }
    if (scope.class_no === undefined) {
      setDrafts([])
      setCounts(null)
      setSelectedId(null)
      return
    }
    try {
      const res = await listDrafts(filter, scope)
      setDrafts(res.drafts)
      setCounts(res.counts)
      setSelectedId((cur) =>
        cur && res.drafts.some((d) => d.id === cur) ? cur : (res.drafts[0]?.id ?? null)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.")
    }
  }, [filter, scope, issue])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listSchools().then(setSchools).catch((e: Error) => setError(e.message))
    // 탭 개수만 쓴다 — codex 실패 목록이 가장 작아 이걸로 받는다.
    listDraftIssues("codex_failed").then((r) => setIssueCounts(r.counts)).catch(() => {})
  }, [])

  const changeIssue = (next: DraftIssue | null) => {
    setIssue(next)
    setChecked(new Set())
    setSelectedId(null)
  }

  // 고른 초안들의 이미지를 백그라운드로 다시 만든다. 진행은 위 일괄 생성 패널에 보인다.
  // △ 탭은 검수 이유를 반영해(직업·문구면 텍스트, 그 밖은 이미지) 다시 만든다.
  const regenerate = async (ids: string[]) => {
    const what = issue === "triangle" ? "△ 이유를 반영해 다시 만들까요" : "이미지를 다시 만들까요"
    if (!confirm(`${ids.length}명의 ${what}? (동시 ${regenConcurrency})`)) return
    setError(null)
    try {
      await (issue === "triangle" ? regenerateReview : regenerateImages)(ids, regenConcurrency)
      setChecked(new Set())
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "재생성을 시작하지 못했습니다.")
    }
  }

  const changeScope = (next: DraftScope) => {
    setScope(next)
    setChecked(new Set())
    if (next.school !== scope.school) {
      setClasses([])
      if (next.school) listClasses(next.school).then(setClasses).catch((e: Error) => setError(e.message))
    }
  }
  const grades = [...new Set(classes.map((c) => c.grade))]
  const isGuest = scope.school === ""
  const gradeClasses = classes.filter((c) => c.grade === scope.grade)

  const refreshCard = useCallback(async (d: Draft) => {
    setCard(null)
    setQrUrl(null)
    try {
      const preview = await previewDraftCard(d.id)
      setCard(preview.image_base64)
      setQrUrl(preview.qr_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "카드 미리보기에 실패했습니다.")
    }
  }, [])

  // 선택이 바뀌면 편집값·카드 미리보기를 그 초안으로 맞춘다.
  useEffect(() => {
    if (!selected) {
      setEdit(null)
      setCard(null)
      return
    }
    setEdit(toEdit(selected))
    setVerdictReason(selected.verdict === "triangle" ? selected.verdict_reason : "")
    refreshCard(selected)
    // selected 객체가 아니라 id 기준 — 저장으로 객체만 바뀔 땐 여기서 다시 돌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const replace = (d: Draft) => setDrafts((list) => list.map((x) => (x.id === d.id ? d : x)))

  const selectNext = (id: string) => {
    const i = drafts.findIndex((d) => d.id === id)
    setSelectedId(drafts[i + 1]?.id ?? drafts[i - 1]?.id ?? null)
  }

  const act = async (label: string, fn: () => Promise<Draft>, advance = false) => {
    if (!selected) return
    setBusy(label)
    setError(null)
    try {
      const d = await fn()
      replace(d)
      if (advance) {
        await load()
        selectNext(d.id)
      } else {
        setEdit(toEdit(d))
        await refreshCard(d)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label}에 실패했습니다.`)
    } finally {
      setBusy(null)
    }
  }

  const id = selected?.id ?? ""
  const save = () => act("저장", () => updateDraft(id, edit!))
  // 승인 전 편집값을 먼저 저장한다 — 카드는 서버에 저장된 문구로 합성된다.
  const approve = () =>
    act(
      "승인",
      async () => {
        await updateDraft(id, edit!)
        return draftAction(id, "approve")
      },
      filter === "pending"
    )
  const reject = () => act("반려", () => draftAction(id, "reject"), filter === "pending")
  // 재검수 탭에선 평가하면 목록에서 빠지므로 다음 학생으로 넘어간다.
  const judge = (v: Verdict | null) =>
    act("평가", () => setDraftVerdict(id, v, v === "triangle" ? verdictReason : ""), issue === "regenerated")
  const regenText = () => act("텍스트 재생성", () => draftAction(id, "regenerate-text"))
  const regenImage = () => act("이미지 재생성", () => draftAction(id, "regenerate-image"))
  const useFallback = () => act("폴백 적용", () => draftAction(id, "use-fallback"))

  // 삭제하면 그 학생은 다시 일괄 생성 대상이 된다.
  const remove = async (ids: string[]) => {
    const approved = drafts.filter((d) => ids.includes(d.id) && d.status === "approved").length
    const warn = approved ? `\n승인된 ${approved}건은 확정된 카드도 함께 지워집니다.` : ""
    if (!confirm(`초안 ${ids.length}건을 삭제할까요? 다시 생성할 수 있습니다.${warn}`)) return
    setBusy("삭제")
    setError(null)
    try {
      await deleteDrafts(ids)
      setChecked(new Set())
      await load()
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.")
    } finally {
      setBusy(null)
    }
  }

  const toggleCheck = (draftId: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(draftId)
      else next.delete(draftId)
      return next
    })
  const allChecked = drafts.length > 0 && drafts.every((d) => checked.has(d.id))

  const listView = (
    <>
            <div className="flex items-center justify-between gap-2 px-1 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={drafts.length === 0}
                  onChange={(e) => setChecked(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())}
                />
                전체 {drafts.length}건
              </label>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => remove([...checked])}
                disabled={checked.size === 0 || !!busy}
              >
                <Trash2 /> 선택 삭제 {checked.size || ""}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
              <Button
                size="sm"
                variant="outline"
                onClick={() => regenerate([...checked])}
                disabled={checked.size === 0}
              >
                <ImageIcon /> {issue === "triangle" ? "선택 이유 반영 재생성" : "선택 이미지 재생성"}{" "}
                {checked.size || ""}
              </Button>
              {issue && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerate(drafts.map((d) => d.id))}
                  disabled={drafts.length === 0}
                >
                  <RefreshCw /> {issue === "triangle" ? "전체 이유 반영 재생성" : "전체 재생성"}{" "}
                  {drafts.length}
                </Button>
              )}
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={regenConcurrency}
                onChange={(e) => setRegenConcurrency(Number(e.target.value))}
                title="동시 codex 실행 수"
              >
                {[1, 2, 4, 6, 8, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    동시 {n}
                  </option>
                ))}
              </select>
            </div>
            <ul className="flex max-h-[80vh] flex-col gap-1 overflow-y-auto rounded-lg border p-2">
              {drafts.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">초안이 없습니다.</li>
              )}
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted ${
                    d.id === selectedId ? "bg-muted" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`${d.student_name} 선택`}
                    checked={checked.has(d.id)}
                    onChange={(e) => toggleCheck(d.id, e.target.checked)}
                  />
                  <button onClick={() => setSelectedId(d.id)} className="flex-1 text-left text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{d.student_name}</span>
                      {!d.image_url && <span className="text-xs text-muted-foreground">폴백</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.school
                        ? `${d.school} ${d.grade}-${d.class_no}-${d.student_no}`
                        : classLabel(d.grade, d.class_no)}{" "}
                      · {d.base_career}
                    </div>
                    {/* 재생성 대상 모드: 왜 다시 만드는지 */}
                    {issue && (
                      <div className="line-clamp-2 text-xs text-destructive">
                        {issue === "regenerated"
                          ? `이전 ${d.prev_verdict ? VERDICT_MARK[d.prev_verdict] : "평가 없음"} ${d.prev_verdict_reason}`
                          : d.verdict === "triangle"
                            ? `△ ${d.verdict_reason || "(이유 없음)"}`
                            : (d.error ?? "이미지·오류 기록 없음 (중간에 끊김)")}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
    </>
  )

  const field = (key: keyof DraftEdit, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        value={edit?.[key] ?? ""}
        onChange={(e) => setEdit((v) => (v ? { ...v, [key]: e.target.value } : v))}
      />
    </label>
  )

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <Link
        href="/dev"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 개발 도구
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2">
            검수
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">페르소나 카드 검수</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            아래에서 학교·학년·반을 골라 일괄 생성하거나, 터미널에서{" "}
            <code>uv run python -m scripts.batch_drafts</code>로 돌립니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant={issue === null ? "default" : "outline"}
            onClick={() => changeIssue(null)}
          >
            반별 검수
          </Button>
          {(Object.keys(ISSUE_LABEL) as DraftIssue[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={issue === k ? "default" : "outline"}
              onClick={() => changeIssue(k)}
            >
              {ISSUE_LABEL[k]} {issueCounts ? issueCounts[k] : ""}
            </Button>
          ))}
        </div>
        {issue === null && (
        <div className="flex gap-2">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => {
                setFilter(s)
                setChecked(new Set())
              }}
            >
              {STATUS_LABEL[s]} {counts ? counts[s] : ""}
            </Button>
          ))}
          <Button
            size="sm"
            variant={filter === undefined ? "default" : "outline"}
            onClick={() => {
              setFilter(undefined)
              setChecked(new Set())
            }}
          >
            전체
          </Button>
        </div>
        )}
        </div>
      </header>

      <BatchPanel onProgress={load} refreshKey={refreshKey} />

      {error && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {issue ? (
            listView
          ) : (
          <>
          <nav className="flex flex-wrap items-center gap-1 px-1 text-sm">
            <Crumb onClick={() => changeScope({})} active={scope.school === undefined}>
              학교
            </Crumb>
            {scope.school !== undefined && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <Crumb
                  onClick={() => changeScope({ school: scope.school })}
                  active={scope.grade === undefined || isGuest}
                >
                  {schoolLabel(scope.school)}
                </Crumb>
              </>
            )}
            {/* 개인 참여자는 학년·반이 없다(0학년 0반) — 학교 단계에서 바로 목록으로 간다. */}
            {scope.grade !== undefined && !isGuest && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <Crumb
                  onClick={() => changeScope({ school: scope.school, grade: scope.grade })}
                  active={scope.class_no === undefined}
                >
                  {scope.grade}학년
                </Crumb>
              </>
            )}
            {scope.class_no !== undefined && !isGuest && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <Crumb active>{scope.class_no}반</Crumb>
              </>
            )}
          </nav>

          {scope.school === undefined ? (
            <ul className="flex max-h-[80vh] flex-col gap-1 overflow-y-auto rounded-lg border p-2">
              {schools.map((school) => (
                <li key={school}>
                  <button
                    onClick={() =>
                      changeScope(school ? { school } : { school, grade: 0, class_no: 0 })
                    }
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {schoolLabel(school)}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : scope.grade === undefined ? (
            <PickGrid
              items={grades.map((g) => ({ key: g, label: `${g}학년` }))}
              onPick={(grade) => changeScope({ school: scope.school, grade })}
            />
          ) : scope.class_no === undefined ? (
            <PickGrid
              items={gradeClasses.map((c) => ({
                key: c.class_no,
                label: `${c.class_no}반`,
                sub: `완료 ${c.completed}/${c.total}`,
              }))}
              onPick={(class_no) => changeScope({ ...scope, class_no })}
            />
          ) : (
            listView
          )}
          </>
          )}
        </div>

        {selected && edit && (
          <section className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Figure label="원본 사진" src={selected.photo_url} />
              <Figure
                label={selected.image_url ? "생성 이미지" : "폴백 캐릭터 (생성 이미지 없음)"}
                src={selected.image_url ?? "/card-fallback.webp"}
              />
              <Figure
                label="카드 미리보기"
                src={card ? `data:image/png;base64,${card}` : null}
              />
            </div>
            {selected.error && (
              <p className="text-sm text-destructive">
                {selected.image_url ? "마지막 재생성 실패" : "폴백 캐릭터 사용"}: {selected.error}
              </p>
            )}
            {selected.verdict === "triangle" && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                △ 평가{selected.verdict_reason ? `: ${selected.verdict_reason}` : ""}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {field("headline", "카드 윗줄 (수식어)")}
              {field("base_career", "카드 아랫줄 (직업명)")}
              {field("name", "persona_name 전체")}
              {field("note", "검수 메모")}
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">설명 (short_description)</span>
                <Textarea
                  value={edit.tagline}
                  onChange={(e) => setEdit({ ...edit, tagline: e.target.value })}
                />
              </label>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-4 text-sm">
              <dt className="text-muted-foreground">QR 링크</dt>
              <dd className="break-all">
                {qrUrl ? (
                  <a href={qrUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {qrUrl}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">상태</dt>
              <dd>{STATUS_LABEL[selected.status]}</dd>
              {(
                [
                  ["Anchor", "persona_anchor"],
                  ["Target", "target"],
                  ["Desired Impact", "desired_impact"],
                  ["가치·태도", "value_attitude"],
                  ["문제해결", "problem_solving"],
                  ["Career 이유", "career_reason"],
                ] as const
              ).map(([label, key]) => (
                <Fragment key={key}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{String(selected.raw[key] ?? "—")}</dd>
                </Fragment>
              ))}
              <dt className="text-muted-foreground">역량 키워드</dt>
              <dd>
                {(() => {
                  // v40 키, 없으면 v1 시절 초안의 키.
                  const c = selected.raw.career_required_competencies ?? selected.raw.competencies
                  return Array.isArray(c) ? c.join(" · ") : "(없음)"
                })()}
              </dd>
            </dl>

            {/* O/X/△ 검수 — /admin/review와 같은 평가. 재생성한 결과를 여기서 바로 다시 본다. */}
            <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              {selected.regenerated_at && (
                <p className="text-muted-foreground">
                  재생성됨 · 이전 평가{" "}
                  {selected.prev_verdict ? VERDICT_MARK[selected.prev_verdict] : "없음"}
                  {selected.prev_verdict_reason && ` — ${selected.prev_verdict_reason}`}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">검수</span>
                {(["o", "triangle", "x"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={selected.verdict === v ? "default" : "outline"}
                    onClick={() => judge(selected.verdict === v ? null : v)}
                    disabled={!!busy}
                  >
                    {VERDICT_MARK[v]}
                  </Button>
                ))}
                <Input
                  className="h-8 max-w-xs"
                  placeholder="△ 이유 (△ 누르기 전에 적기)"
                  value={verdictReason}
                  onChange={(e) => setVerdictReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={approve} disabled={!!busy}>
                <Check /> 승인
              </Button>
              <Button variant="outline" onClick={save} disabled={!!busy}>
                <Save /> 저장·미리보기
              </Button>
              <Button variant="outline" onClick={regenText} disabled={!!busy}>
                <RefreshCw /> 텍스트 재생성
              </Button>
              <Button variant="outline" onClick={regenImage} disabled={!!busy}>
                <ImageIcon /> 이미지 재생성
              </Button>
              <Button
                variant="outline"
                onClick={useFallback}
                disabled={!!busy || !selected.image_url}
              >
                <Smile /> 폴백 이미지로
              </Button>
              <Button variant="destructive" onClick={reject} disabled={!!busy}>
                <X /> 반려
              </Button>
              <Button variant="ghost" onClick={() => remove([selected.id])} disabled={!!busy}>
                <Trash2 /> 삭제
              </Button>
              {busy && (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {busy} 중… (codex는 30~90초)
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Crumb({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={active}
      className={active ? "font-semibold" : "text-muted-foreground hover:text-foreground hover:underline"}
    >
      {children}
    </button>
  )
}

function PickGrid({
  items,
  onPick,
}: {
  items: { key: number; label: string; sub?: string }[]
  onPick: (key: number) => void
}) {
  if (items.length === 0) return <p className="rounded-lg border p-3 text-sm text-muted-foreground">불러오는 중…</p>
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border p-2">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onPick(it.key)}
          className="flex flex-col items-center rounded-md border px-2 py-3 text-sm font-medium hover:bg-muted"
        >
          {it.label}
          {it.sub && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{it.sub}</span>}
        </button>
      ))}
    </div>
  )
}

function Figure({ label, src }: { label: string; src: string | null }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="size-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">없음</span>
        )}
      </div>
    </figure>
  )
}
