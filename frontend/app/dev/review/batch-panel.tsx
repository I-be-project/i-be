"use client"

// 학교 → 반 목록에서 여러 반을 골라 초안을 일괄 생성한다. 학교를 넘나들며 골라도 된다.
// 작업은 백엔드 백그라운드에서 돌고, 여기서는 진행률만 폴링한다 —
// 페이지를 닫아도 작업은 계속된다(서버 재시작 시엔 끊김).

import { useEffect, useState } from "react"
import { Loader2, Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  cancelBatch,
  getBatch,
  listClasses,
  listSchools,
  startBatch,
  type BatchClass,
  type BatchStatus,
  type DevClass,
} from "@/lib/devApi"

// codex 실측: 텍스트 ~30초 + 이미지 ~60초.
const SECONDS_PER_STUDENT = 90
const POLL_MS = 3000

const keyOf = (c: BatchClass) => `${c.school}|${c.grade}|${c.class_no}`

export function BatchPanel({
  onProgress,
  refreshKey,
}: {
  onProgress: () => void
  // 바뀌면 반별 대상 수를 다시 받는다(초안 삭제 후 등).
  refreshKey: number
}) {
  const [schools, setSchools] = useState<string[]>([])
  const [school, setSchool] = useState<string | null>(null)
  const [classes, setClasses] = useState<DevClass[]>([])
  // 선택한 반 → 그 반의 대상 수. 학교를 바꿔도 선택은 유지된다.
  const [selected, setSelected] = useState<Map<string, { cls: BatchClass; targets: number }>>(
    new Map()
  )
  const [concurrency, setConcurrency] = useState(2)
  const [status, setStatus] = useState<BatchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSchools().then(setSchools).catch((e: Error) => setError(e.message))
    getBatch().then(setStatus).catch(() => {})
  }, [])

  const running = status?.running ?? false
  const done = status?.done ?? 0

  // 학교를 고르거나, 작업이 끝나거나, 초안이 지워지면 반별 대상 수를 새로 받는다.
  useEffect(() => {
    if (!school) return
    listClasses(school).then(setClasses).catch((e: Error) => setError(e.message))
  }, [school, running, refreshKey])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => getBatch().then(setStatus).catch(() => {}), POLL_MS)
    return () => clearInterval(timer)
  }, [running])
  useEffect(() => {
    if (done > 0) onProgress()
    // onProgress는 부모 렌더마다 새 함수다 — 진행 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, running])

  const toggle = (c: DevClass, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev)
      const cls = { school: school!, grade: c.grade, class_no: c.class_no }
      if (on) next.set(keyOf(cls), { cls, targets: c.targets })
      else next.delete(keyOf(cls))
      return next
    })

  const selectable = classes.filter((c) => c.targets > 0)
  const isOn = (c: DevClass) =>
    selected.has(keyOf({ school: school!, grade: c.grade, class_no: c.class_no }))
  const allOn = selectable.length > 0 && selectable.every(isOn)

  const picked = [...selected.values()]
  const total = picked.reduce((n, p) => n + p.targets, 0)

  const start = async () => {
    const hours = ((total * SECONDS_PER_STUDENT) / concurrency / 3600).toFixed(1)
    if (!confirm(`${picked.length}개 반 · ${total}명 생성 — 약 ${hours}시간 걸립니다. 시작할까요?`))
      return
    setError(null)
    try {
      setStatus(await startBatch({ classes: picked.map((p) => p.cls), concurrency }))
      setSelected(new Map())
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.")
    }
  }

  const stop = async () => {
    try {
      // 취소는 비동기로 반영된다 — 폴링이 이어서 '중단됨'을 받아온다.
      setStatus(await cancelBatch())
    } catch (e) {
      setError(e instanceof Error ? e.message : "중단하지 못했습니다.")
    }
  }

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">일괄 생성</h2>

      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <ul className="max-h-72 overflow-y-auto rounded-md border p-1 text-sm">
          {schools.map((s) => {
            const n = picked.filter((p) => p.cls.school === s).length
            return (
              <li key={s}>
                <button
                  onClick={() => setSchool(s)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-muted ${
                    s === school ? "bg-muted font-medium" : ""
                  }`}
                >
                  <span>{s}</span>
                  {n > 0 && <span className="text-xs text-primary">{n}개 반</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="max-h-72 overflow-y-auto rounded-md border text-sm">
          {!school ? (
            <p className="p-3 text-muted-foreground">왼쪽에서 학교를 고르세요.</p>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="w-10 p-2">
                    <input
                      type="checkbox"
                      aria-label="대상 있는 반 전체 선택"
                      checked={allOn}
                      disabled={running || selectable.length === 0}
                      onChange={(e) => selectable.forEach((c) => toggle(c, e.target.checked))}
                    />
                  </th>
                  <th className="p-2 text-left">반</th>
                  <th className="p-2 text-right">설문 완료</th>
                  <th className="p-2 text-right">대상 (초안 없음)</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr
                    key={`${c.grade}-${c.class_no}`}
                    className={`border-b last:border-0 ${c.targets ? "" : "text-muted-foreground"}`}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${c.grade}학년 ${c.class_no}반`}
                        checked={isOn(c)}
                        disabled={running || c.targets === 0}
                        onChange={(e) => toggle(c, e.target.checked)}
                      />
                    </td>
                    <td className="p-2">
                      {c.grade}학년 {c.class_no}반
                    </td>
                    <td className="p-2 text-right">
                      {c.completed}/{c.total}
                    </td>
                    <td className="p-2 text-right">{c.targets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          선택 {picked.length}개 반 · 대상 {total}명
        </span>
        {picked.length > 0 && !running && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
            선택 해제
          </Button>
        )}
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={concurrency}
          onChange={(e) => setConcurrency(Number(e.target.value))}
          disabled={running}
          title="동시 codex 실행 수"
        >
          {[1, 2, 4, 6, 8, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              동시 {n}
            </option>
          ))}
        </select>
        {running ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square /> 중단
          </Button>
        ) : (
          <Button size="sm" onClick={start} disabled={total === 0}>
            <Play /> 생성 시작
          </Button>
        )}
      </div>

      {status && status.total > 0 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            {running && <Loader2 className="size-4 animate-spin" />}
            <span>
              {status.label} · {status.done}/{status.total}
              {status.failed > 0 && ` · 텍스트 실패 ${status.failed}`}
              {!running && (status.cancelled ? " · 중단됨" : " · 완료")}
            </span>
          </div>
          <Progress value={(status.done / status.total) * 100} />
          {status.errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary>최근 실패 {status.errors.length}건</summary>
              <ul className="mt-1 list-disc pl-4">
                {status.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
