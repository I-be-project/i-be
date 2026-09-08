"use client"

// DB에서 학생을 골라주는 선택기 — 페르소나·미래 사진 두 화면이 함께 쓴다.
//
// requires로 "이 화면이 요구하는 조건"을 받아, 조건을 못 채우는 학생은 고를 수 없게 한다.
// (사진 없는 학생을 미래 사진 화면에서 고르면 서버 404가 날 뿐이라 미리 막는다.)

import { useEffect, useState } from "react"
import { ImageOff, ListChecks, Search, UserRound } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { listDevStudents, type DevStudent } from "@/lib/devApi"

interface Props {
  requires: "answers" | "photo"
  selected: DevStudent | null
  onSelect: (student: DevStudent) => void
}

function isEligible(student: DevStudent, requires: Props["requires"]): boolean {
  return requires === "photo" ? student.has_photo : student.has_answers
}

export function StudentPicker({ requires, selected, onSelect }: Props) {
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<DevStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 입력이 멈춘 뒤에 조회한다(글자마다 요청하지 않도록).
  useEffect(() => {
    let cancelled = false
    // setLoading은 디바운스가 실제로 발동한 뒤에 켠다 — 이펙트 본문에서 곧바로
    // setState하면 타이핑 한 글자마다 연쇄 렌더가 난다(react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setLoading(true)
      listDevStudents(query || undefined)
        .then((data) => {
          if (cancelled) return
          setStudents(data.students)
          setError(null)
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름으로 검색"
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            학생이 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {students.map((s) => {
              const eligible = isEligible(s, requires)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!eligible}
                    onClick={() => onSelect(s)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                      eligible
                        ? "hover:bg-muted/60"
                        : "cursor-not-allowed opacity-45",
                      selected?.id === s.id && "bg-muted",
                    )}
                  >
                    <UserRound className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.school} {s.grade}학년 {s.class_no}반 {s.student_no}번
                      </div>
                    </div>
                    {!eligible && (
                      <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                        {requires === "photo" ? (
                          <>
                            <ImageOff className="size-3" /> 사진 없음
                          </>
                        ) : (
                          <>
                            <ListChecks className="size-3" /> 답변 없음
                          </>
                        )}
                      </Badge>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
