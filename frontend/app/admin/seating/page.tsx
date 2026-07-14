"use client";

import { Inbox, School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { StudentDetailDialog } from "@/components/admin/StudentDetailDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  fetchAdminSchools,
  fetchAdminStudents,
  type AdminProgressStatus,
  type AdminStudentItem,
} from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { cn } from "@/lib/utils";

// 상태별 셀 색상 — ProgressBadge와 동일한 팔레트를 따른다.
const CELL_STYLE: Record<AdminProgressStatus, string> = {
  completed:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  in_progress:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  not_started:
    "border-border bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<AdminProgressStatus, string> = {
  completed: "완료",
  in_progress: "진행중",
  not_started: "미시작",
};

const LEGEND: { key: AdminProgressStatus | "missing"; label: string; swatch: string }[] = [
  { key: "completed", label: "완료", swatch: "border-emerald-300 bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/20" },
  { key: "in_progress", label: "진행중", swatch: "border-amber-300 bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/20" },
  { key: "not_started", label: "미시작", swatch: "border-border bg-muted" },
  { key: "missing", label: "미가입", swatch: "border-dashed border-border/70 bg-transparent" },
];

/** 라벨 + 카드 목록을 감싸는 선택 그룹. */
function PickerGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** 선택 가능한 카드 버튼. selected면 강조된다. */
function PickerCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-w-[72px] rounded-xl border px-4 py-2.5 text-left text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default function AdminSeatingPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<string[]>([]);
  const [school, setSchool] = useState<string>("");
  const [students, setStudents] = useState<AdminStudentItem[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [classNo, setClassNo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);

  // 학교 목록 로드 — 마운트 시 1회.
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    fetchAdminSchools(token)
      .then((list) => {
        setSchools(list);
        // 학교가 하나도 없으면 학생 로드가 일어나지 않으므로 여기서 로딩 종료.
        if (list.length === 0) setLoading(false);
      })
      .catch(() => {
        setSchools([]);
        setLoading(false);
      });
  }, [router]);

  // 선택된 학교의 전체 학생을 불러온다(한 학교 단위라 규모가 제한적).
  const loadStudents = useCallback(
    async (target: string) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      setLoading(true);
      try {
        const res = await fetchAdminStudents(token, {
          school: target,
          limit: 1000,
          sort: "name_asc",
        });
        setStudents(res.items);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // 학교가 정해지면(첫 로드 시 자동) 학생을 불러온다.
  useEffect(() => {
    if (school) loadStudents(school);
  }, [school, loadStudents]);

  useEffect(() => {
    // 학교 목록이 오면 첫 학교를 자동 선택.
    if (schools.length > 0 && !school) setSchool(schools[0]);
  }, [schools, school]);

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b),
    [students]
  );
  const classes = useMemo(
    () =>
      [
        ...new Set(
          students.filter((s) => s.grade === grade).map((s) => s.class_no)
        ),
      ].sort((a, b) => a - b),
    [students, grade]
  );

  // 학년·반 선택값을 항상 유효 범위로 보정한다.
  useEffect(() => {
    if (grades.length > 0 && (grade === null || !grades.includes(grade))) {
      setGrade(grades[0]);
    }
  }, [grades, grade]);
  useEffect(() => {
    if (classes.length > 0 && (classNo === null || !classes.includes(classNo))) {
      setClassNo(classes[0]);
    }
  }, [classes, classNo]);

  const classStudents = useMemo(
    () => students.filter((s) => s.grade === grade && s.class_no === classNo),
    [students, grade, classNo]
  );

  const byNo = useMemo(() => {
    const map = new Map<number, AdminStudentItem>();
    classStudents.forEach((s) => map.set(s.student_no, s));
    return map;
  }, [classStudents]);

  const maxNo = classStudents.reduce((m, s) => Math.max(m, s.student_no), 0);
  const numbers = Array.from({ length: maxNo }, (_, i) => i + 1);

  const counts = useMemo(() => {
    const c = { completed: 0, in_progress: 0, not_started: 0 };
    classStudents.forEach((s) => (c[s.progress.status] += 1));
    return c;
  }, [classStudents]);
  const registered = classStudents.length;
  const missing = maxNo - registered;

  return (
    <div className="min-h-screen bg-muted/40">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            진행 현황
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">반별 좌석표</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            학교·학년·반을 선택하면 번호별 참여 진행 상태를 한눈에 확인합니다.
          </p>
        </div>

        {/* 학교 · 학년 · 반 선택 (카드형) */}
        <div className="mb-6 flex flex-col gap-4">
          <PickerGroup label="학교">
            {schools.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-28 rounded-xl" />
                ))
              : schools.map((s) => (
                  <PickerCard
                    key={s}
                    selected={s === school}
                    onClick={() => setSchool(s)}
                  >
                    {s}
                  </PickerCard>
                ))}
          </PickerGroup>

          {grades.length > 0 && (
            <PickerGroup label="학년">
              {grades.map((g) => (
                <PickerCard
                  key={g}
                  selected={g === grade}
                  onClick={() => setGrade(g)}
                >
                  {g}학년
                </PickerCard>
              ))}
            </PickerGroup>
          )}

          {classes.length > 0 && (
            <PickerGroup label="반">
              {classes.map((c) => {
                const cs = students.filter(
                  (s) => s.grade === grade && s.class_no === c
                );
                const done = cs.filter(
                  (s) => s.progress.status === "completed"
                ).length;
                return (
                  <PickerCard
                    key={c}
                    selected={c === classNo}
                    onClick={() => setClassNo(c)}
                  >
                    <span className="flex items-center gap-2">
                      {c}반
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {done}/{cs.length}
                      </span>
                    </span>
                  </PickerCard>
                );
              })}
            </PickerGroup>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 요약 + 범례 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              완료{" "}
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {counts.completed}
              </span>
              <span className="text-muted-foreground"> / {registered}명</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              진행중 {counts.in_progress} · 미시작 {counts.not_started} · 미가입{" "}
              {missing < 0 ? 0 : missing}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {LEGEND.map((l) => (
              <span
                key={l.key}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={cn("size-3 rounded-sm border", l.swatch)}
                  aria-hidden
                />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* 좌석표 격자 */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : maxNo === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              {students.length === 0 ? (
                <School className="size-8" aria-hidden />
              ) : (
                <Inbox className="size-8" aria-hidden />
              )}
              <p className="text-sm">
                {students.length === 0
                  ? "해당 학교에 가입한 학생이 없습니다."
                  : "이 반에 가입한 학생이 없습니다."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
              {numbers.map((n) => {
                const student = byNo.get(n);
                if (!student) {
                  return (
                    <div
                      key={n}
                      className="flex h-16 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 text-muted-foreground/50"
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        {n}
                      </span>
                      <span className="text-[10px]">미가입</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelected(student)}
                    title={`${student.name} · ${STATUS_LABEL[student.progress.status]}`}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-center transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      CELL_STYLE[student.progress.status]
                    )}
                  >
                    <span className="text-sm font-bold tabular-nums leading-none">
                      {n}
                    </span>
                    <span className="max-w-full truncate text-xs font-medium leading-tight">
                      {student.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <StudentDetailDialog
        student={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          if (school) loadStudents(school);
        }}
      />
    </div>
  );
}
