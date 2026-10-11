// 선택한 학생의 최근 세션 답변 — 페르소나 프롬프트에 들어가는 입력을 그대로 보여준다.
// /dev/persona와 /dev/api-draft가 같이 쓴다.

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DevStudent, StudentAnswers } from "@/lib/devApi"

// 1·2순위를 한 줄로. 2순위가 없으면 1순위만.
function ranked(first: string | null, second: string | null): string | null {
  if (!first) return null
  return second ? `${first} → ${second}` : first
}

export function AnswerPreview({
  student,
  answers,
}: {
  student: DevStudent
  answers: StudentAnswers | null
}) {
  if (!answers) {
    return (
      <p className="text-sm text-muted-foreground">{student.name}의 답변을 불러오는 중…</p>
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
    ["Q7 공간", ranked(answers.q7a_first, answers.q7a_second)],
    ["Q7 도구", ranked(answers.q7b_first, answers.q7b_second)],
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
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
            <span className={value ? "" : "text-muted-foreground"}>{value ?? "(없음)"}</span>
          </div>
        ))}
        {answers.q1to6_texts.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Q1~Q6 응답 {answers.q1to6_texts.length}개
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs">
              {answers.q1to6_texts.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
