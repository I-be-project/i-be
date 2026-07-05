import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminProgressStatus, AdminStudentProgress } from "@/lib/api";

/** 설문 단계 순서와 라벨 — 목록/상세에서 공통 사용. */
export const SURVEY_STAGES: { key: string; label: string }[] = [
  { key: "q1to6", label: "RIASEC" },
  { key: "q7a", label: "Q7-A" },
  { key: "q7b", label: "Q7-B" },
  { key: "q8", label: "Q8" },
  { key: "q9", label: "Q9" },
];

const STATUS_META: Record<
  AdminProgressStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  not_started: {
    label: "미시작",
    className:
      "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    icon: CircleDashed,
  },
  in_progress: {
    label: "진행중",
    className:
      "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
    icon: Loader2,
  },
  completed: {
    label: "완료",
    className:
      "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
    icon: CheckCircle2,
  },
};

/** 진행중일 때 마지막으로 도달한 단계 라벨(힌트). */
function lastStageLabel(stages: string[]): string | null {
  for (let i = SURVEY_STAGES.length - 1; i >= 0; i--) {
    if (stages.includes(SURVEY_STAGES[i].key)) return SURVEY_STAGES[i].label;
  }
  return null;
}

export function ProgressBadge({ progress }: { progress: AdminStudentProgress }) {
  const meta = STATUS_META[progress.status];
  const Icon = meta.icon;
  const hint =
    progress.status === "in_progress" ? lastStageLabel(progress.stages_done) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
      {hint && <span className="tabular-nums opacity-70">· {hint}</span>}
    </span>
  );
}
