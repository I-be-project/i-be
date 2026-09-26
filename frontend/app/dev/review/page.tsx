"use client"

// 페르소나·카드 검수 — scripts/batch_drafts.py가 만든 초안을 한 명씩 보고 확정한다.
// 원본 사진 ↔ 생성 이미지 ↔ 합성 카드를 나란히 두고, 카드 문구를 고치거나
// 텍스트/이미지를 따로 재생성한 뒤 승인한다. 승인하면 카드 PNG가 S3에 저장되고
// generated.personas·cards에 확정된다(학생 화면·인쇄는 확정본만 읽는다).

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, ImageIcon, Loader2, RefreshCw, Save, Smile, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  draftAction,
  listDrafts,
  previewDraftCard,
  updateDraft,
  type Draft,
  type DraftEdit,
  type DraftStatus,
} from "@/lib/devApi"
import { BatchPanel } from "./batch-panel"

const STATUS_LABEL: Record<DraftStatus, string> = {
  pending: "검수 대기",
  approved: "승인",
  rejected: "반려",
}

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
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = drafts.find((d) => d.id === selectedId) ?? null

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await listDrafts(filter)
      setDrafts(res.drafts)
      setCounts(res.counts)
      setSelectedId((cur) =>
        cur && res.drafts.some((d) => d.id === cur) ? cur : (res.drafts[0]?.id ?? null)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.")
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const refreshCard = useCallback(async (d: Draft) => {
    setCard(null)
    try {
      setCard((await previewDraftCard(d.id)).image_base64)
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
  const regenText = () => act("텍스트 재생성", () => draftAction(id, "regenerate-text"))
  const regenImage = () => act("이미지 재생성", () => draftAction(id, "regenerate-image"))
  const useFallback = () => act("폴백 적용", () => draftAction(id, "use-fallback"))

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
        <div className="flex gap-2">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => setFilter(s)}
            >
              {STATUS_LABEL[s]} {counts ? counts[s] : ""}
            </Button>
          ))}
          <Button
            size="sm"
            variant={filter === undefined ? "default" : "outline"}
            onClick={() => setFilter(undefined)}
          >
            전체
          </Button>
        </div>
      </header>

      <BatchPanel onProgress={load} />

      {error && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ul className="flex max-h-[80vh] flex-col gap-1 overflow-y-auto rounded-lg border p-2">
          {drafts.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">초안이 없습니다.</li>
          )}
          {drafts.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setSelectedId(d.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                  d.id === selectedId ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.student_name}</span>
                  {!d.image_url && <span className="text-xs text-muted-foreground">폴백</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.school} {d.grade}-{d.class_no}-{d.student_no} · {d.base_career}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {selected && edit && (
          <section className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Figure label="원본 사진" src={selected.photo_url} />
              <Figure label="생성 이미지 (없으면 폴백 캐릭터)" src={selected.image_url} />
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
              <dt className="text-muted-foreground">상태</dt>
              <dd>{STATUS_LABEL[selected.status]}</dd>
              <dt className="text-muted-foreground">Career Pool 내</dt>
              <dd>{selected.source_career_pool ? "예" : "아니오"}</dd>
              <dt className="text-muted-foreground">인접 확장</dt>
              <dd>{selected.pool_extended ? "예" : "아니오"}</dd>
              <dt className="text-muted-foreground">Q8 반영</dt>
              <dd>{String(selected.raw.q8_reflection ?? "")}</dd>
              <dt className="text-muted-foreground">Q9 반영</dt>
              <dd>{String(selected.raw.q9_reflection ?? "")}</dd>
            </dl>

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
