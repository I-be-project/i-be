"use client";

import { Inbox, School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { StudentDetailDialog } from "@/components/admin/StudentDetailDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  fetchAdminClassProgress,
  fetchAdminSchools,
  fetchAdminStudents,
  type AdminClassProgress,
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
  // 학교의 반별 집계 — 학년·반 목록과 완료 배지의 유일한 출처다.
  // 학생 전원을 받아 역산하던 것을 이 한 번의 호출로 대체한다.
  const [classProgress, setClassProgress] = useState<AdminClassProgress[]>([]);
  // 선택한 반의 학생만 담는다. 사진은 받지 않는다(격자가 쓰지 않음).
  const [classStudents, setClassStudents] = useState<AdminStudentItem[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [classNo, setClassNo] = useState<number | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);

  // 응답이 요청 순서대로 도착한다는 보장이 없다. 각 로더마다 "가장 마지막에 시작된
  // 요청" 번호만 기억해, 뒤늦게 도착한 옛 요청이 이후 상태를 덮어쓰지 못하게 막는다.
  const classProgressRequestId = useRef(0);
  const classStudentsRequestId = useRef(0);

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
        // 학교가 하나도 없으면 집계 로드가 일어나지 않으므로 여기서 로딩 종료.
        if (list.length === 0) setLoadingClasses(false);
      })
      .catch(() => {
        setSchools([]);
        setLoadingClasses(false);
      });
  }, [router]);

  const loadClassProgress = useCallback(
    async (target: string) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      // 이 호출을 "가장 최근 요청"으로 등록. 이후 이 값과 어긋나면 뒤따라온 더 새
      // 요청이 이미 있다는 뜻이므로 이 호출의 응답은 화면에 반영하지 않는다.
      const requestId = ++classProgressRequestId.current;
      setLoadingClasses(true);
      // 이전 학교의 집계·학생이 남아 있으면 새 학교 + 옛 반 조합으로 헛요청이 나간다.
      setClassProgress([]);
      setClassStudents([]);
      // 이전 학교에 대해 이미 날아간 반 학생 요청이 있다면 무효화한다. 그대로 두면
      // 그 요청이 나중에 도착했을 때 자기 세대 검사(requestId === current)를 통과해
      // 새 학교 화면 위에 이전 학교 학생 명단을 그대로 커밋해버린다.
      classStudentsRequestId.current += 1;
      try {
        const rows = await fetchAdminClassProgress(token, target);
        if (requestId !== classProgressRequestId.current) return; // 더 새 요청에 밀림
        setClassProgress(rows);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        if (requestId !== classProgressRequestId.current) return; // 더 새 요청에 밀림
        setClassProgress([]);
        setError(
          err instanceof ApiError ? err.message : "진행 현황을 불러오지 못했습니다."
        );
      } finally {
        // 더 새 요청이 이미 자기 로딩 상태를 관리 중이므로 여기서 꺼버리면 안 된다.
        if (requestId === classProgressRequestId.current) setLoadingClasses(false);
      }
    },
    [router]
  );

  const loadClassStudents = useCallback(
    async (target: string, g: number, c: number) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      // 반을 빠르게 연속 클릭하면 두 요청이 겹칠 수 있다 — 마지막 요청만 반영한다.
      const requestId = ++classStudentsRequestId.current;
      setLoadingStudents(true);
      try {
        const res = await fetchAdminStudents(token, {
          school: target,
          grade: g,
          class_no: c,
          // 한 반 정원을 넉넉히 덮는다. 좌석표는 반 단위라 페이지네이션이 필요 없다.
          limit: 100,
          sort: "name_asc",
          // 격자는 번호·이름·상태만 그린다 — 사진 서명은 낭비다.
          include_photo: false,
        });
        if (requestId !== classStudentsRequestId.current) return; // 더 새 요청에 밀림
        setClassStudents(res.items);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        if (requestId !== classStudentsRequestId.current) return; // 더 새 요청에 밀림
        setClassStudents([]);
        setError(
          err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."
        );
      } finally {
        // 더 새 요청이 이미 자기 로딩 상태를 관리 중이므로 여기서 꺼버리면 안 된다.
        if (requestId === classStudentsRequestId.current) setLoadingStudents(false);
      }
    },
    [router]
  );

  // 학교가 정해지면(첫 로드 시 자동) 집계를 불러온다.
  useEffect(() => {
    if (school) loadClassProgress(school);
  }, [school, loadClassProgress]);

  useEffect(() => {
    // 학교 목록이 오면 첫 학교를 자동 선택.
    if (schools.length > 0 && !school) setSchool(schools[0]);
  }, [schools, school]);

  const grades = useMemo(
    () => [...new Set(classProgress.map((r) => r.grade))].sort((a, b) => a - b),
    [classProgress]
  );
  const classRows = useMemo(
    () =>
      classProgress
        .filter((r) => r.grade === grade)
        .sort((a, b) => a.class_no - b.class_no),
    [classProgress, grade]
  );

  // 학년·반 선택값을 항상 유효 범위로 보정한다.
  useEffect(() => {
    if (grades.length > 0 && (grade === null || !grades.includes(grade))) {
      setGrade(grades[0]);
    }
  }, [grades, grade]);
  useEffect(() => {
    const nos = classRows.map((r) => r.class_no);
    if (nos.length > 0 && (classNo === null || !nos.includes(classNo))) {
      setClassNo(nos[0]);
    }
  }, [classRows, classNo]);

  // 학교·학년·반이 모두 정해지면 그 반의 학생만 불러온다.
  // 단, 그 조합이 현재 학교의 집계(classProgress)에 실제로 존재할 때만 요청한다 —
  // 학교를 막 바꿔 학년·반이 아직 이전 학교 값 그대로인 순간에는 이 조건이 거짓이라
  // 헛요청 자체가 나가지 않는다(집계가 갱신되면 grade·classNo 보정 effect가 유효한
  // 값으로 고쳐주고, 그때 이 effect가 다시 발화한다).
  useEffect(() => {
    if (
      school &&
      grade !== null &&
      classNo !== null &&
      classProgress.some((r) => r.grade === grade && r.class_no === classNo)
    ) {
      loadClassStudents(school, grade, classNo);
    }
  }, [school, grade, classNo, classProgress, loadClassStudents]);

  const byNo = useMemo(() => {
    const map = new Map<number, AdminStudentItem>();
    classStudents.forEach((s) => map.set(s.student_no, s));
    return map;
  }, [classStudents]);

  const maxNo = classStudents.reduce((m, s) => Math.max(m, s.student_no), 0);
  const numbers = Array.from({ length: maxNo }, (_, i) => i + 1);

  // 요약 숫자는 집계 행에서 그대로 읽는다(학생 배열을 세지 않는다).
  const current = useMemo(
    () => classRows.find((r) => r.class_no === classNo) ?? null,
    [classRows, classNo]
  );
  const registered = current?.total ?? 0;
  const counts = {
    completed: current?.completed ?? 0,
    in_progress: current?.in_progress ?? 0,
    not_started: current?.not_started ?? 0,
  };
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

          {classRows.length > 0 && (
            <PickerGroup label="반">
              {classRows.map((r) => (
                <PickerCard
                  key={r.class_no}
                  selected={r.class_no === classNo}
                  onClick={() => setClassNo(r.class_no)}
                >
                  <span className="flex items-center gap-2">
                    {r.class_no}반
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {r.completed}/{r.total}
                    </span>
                  </span>
                </PickerCard>
              ))}
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
          {loadingStudents || loadingClasses ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : maxNo === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              {classProgress.length === 0 ? (
                <School className="size-8" aria-hidden />
              ) : (
                <Inbox className="size-8" aria-hidden />
              )}
              <p className="text-sm">
                {classProgress.length === 0
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
          // 집계와 현재 반을 모두 갱신해야 배지와 격자가 함께 맞는다.
          if (school) loadClassProgress(school);
          if (school && grade !== null && classNo !== null) {
            loadClassStudents(school, grade, classNo);
          }
        }}
      />
    </div>
  );
}
