"use client";

// 결과 검수 — /dev/review가 만든 페르소나·카드 초안을 여러 명이 O/X/△로 채점한다.
// 현황(학교·학년·반별 남은 수)에서 반을 고르면 학생 한 명씩 넘기며 평가한다.
// 승인·재생성은 로컬 codex가 필요해 /dev/review에만 있다. 여기선 보기와 평가만.

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Triangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { useConsole } from "@/components/console/ConsoleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  fetchAdminReviewProgress,
  fetchAdminReviews,
  putAdminReview,
  type AdminReviewItem,
  type AdminReviewProgress,
  type ReviewVerdict,
  classLabel,
  schoolLabel,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Scope = { school: string; grade: number; class_no: number };

const VERDICT_STYLE: Record<ReviewVerdict, string> = {
  o: "border-emerald-500 bg-emerald-500 text-white",
  triangle: "border-amber-500 bg-amber-500 text-white",
  x: "border-rose-500 bg-rose-500 text-white",
};
const VERDICT_MARK: Record<ReviewVerdict, string> = { o: "O", triangle: "△", x: "X" };

// 생성 이미지가 없을 때 카드에 들어가는 캐릭터 — backend/app/assets/card/fallback.png 축소본.
const FALLBACK_IMAGE = "/card-fallback.webp";

const done = (p: { o: number; triangle: number; x: number }) => p.o + p.triangle + p.x;

// 현황 표와 같은 순서: 학교 가나다 → 학년 → 반, 개인 참여자(school='')는 맨 끝.
const byOrder = (a: AdminReviewProgress, b: AdminReviewProgress) =>
  (!a.school ? 1 : 0) - (!b.school ? 1 : 0) ||
  a.school.localeCompare(b.school, "ko") ||
  a.grade - b.grade ||
  a.class_no - b.class_no;

/** 현재 반 다음으로, 검수가 남은 반. 없으면 null. 현황은 마지막으로 받은 값 기준이다. */
function nextClass(rows: AdminReviewProgress[], cur: Scope): Scope | null {
  const sorted = [...rows].sort(byOrder);
  const i = sorted.findIndex(
    (r) => r.school === cur.school && r.grade === cur.grade && r.class_no === cur.class_no
  );
  const hit = sorted.slice(i + 1).find((r) => r.drafts > done(r));
  return hit ? { school: hit.school, grade: hit.grade, class_no: hit.class_no } : null;
}

export default function AdminReviewPage() {
  const router = useRouter();
  const { getToken, clearToken, loginPath } = useConsole();
  const [progress, setProgress] = useState<AdminReviewProgress[] | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 토큰이 없거나 만료면 로그인으로, 그 밖의 실패는 화면에 띄운다.
  const call = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T | undefined> => {
      const token = getToken();
      if (!token) {
        router.replace(loginPath);
        return;
      }
      try {
        setError(null);
        return await fn(token);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          router.replace(loginPath);
          return;
        }
        setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
      }
    },
    [getToken, clearToken, loginPath, router]
  );

  // 현황은 반 검수에서 돌아올 때마다 다시 받는다 — 다른 사람이 채운 것도 보인다.
  useEffect(() => {
    if (scope) return;
    // call()이 에러 상태를 비우는 setState를 동기로 부른다 — 의도된 것.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    call(fetchAdminReviewProgress).then((rows) => rows && setProgress(rows));
  }, [call, scope]);

  return (
    <>
      <ConsoleHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6 sm:px-6">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {scope ? (
          <ClassReview
            // 반이 바뀌면 상태(목록·현재 학생)를 새로 시작한다.
            key={`${scope.school}|${scope.grade}|${scope.class_no}`}
            scope={scope}
            call={call}
            onBack={() => setScope(null)}
            next={progress && nextClass(progress, scope)}
            onNext={setScope}
          />
        ) : (
          <ProgressOverview rows={progress} onPick={setScope} />
        )}
      </main>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// 종합 현황 — 참여(가입·설문 완료·미완료)와 검수(O/△/X·남은 수)를 학교 > 반 단위로.
// 반 행을 누르면 그 반 검수로 들어간다. 참여 분류는 최근 세션 기준(좌석표와 같다).
// ──────────────────────────────────────────────────────────────

type Totals = Omit<AdminReviewProgress, "school" | "grade" | "class_no">;

const sum = (list: AdminReviewProgress[]): Totals => {
  const t: Totals = { registered: 0, completed: 0, in_progress: 0, not_started: 0, drafts: 0, o: 0, triangle: 0, x: 0 };
  for (const r of list) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += r[k];
  return t;
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function ProgressOverview({
  rows,
  onPick,
}: {
  rows: AdminReviewProgress[] | null;
  onPick: (s: Scope) => void;
}) {
  if (!rows) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">가입한 학생이 없습니다.</p>;

  const all = sum(rows);
  const reviewed = done(all);
  // 개인 참여자(school='')는 맨 아래로.
  const schools = [...new Set(rows.map((r) => r.school))].sort((a, b) =>
    !a ? 1 : !b ? -1 : a.localeCompare(b, "ko")
  );

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">결과 검수</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          참여 현황과 검수 결과를 학교·반별로 봅니다. 반을 누르면 한 명씩 검수합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="가입" value={all.registered} />
        <Stat label="설문 완료" value={all.completed} sub={pct(all.completed, all.registered)} />
        <Stat
          label="미완료"
          value={all.in_progress + all.not_started}
          sub={`진행중 ${all.in_progress} · 미시작 ${all.not_started}`}
        />
        <Stat label="결과 생성" value={all.drafts} sub={`완료자 중 ${pct(all.drafts, all.completed)}`} />
        <Stat
          label="검수 완료"
          value={reviewed}
          sub={`남은 ${all.drafts - reviewed} · ${pct(reviewed, all.drafts)}`}
        />
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">검수 결과</p>
          <p className="mt-1 flex gap-3 text-lg font-semibold tabular-nums">
            <span className="text-emerald-600">O {all.o}</span>
            <span className="text-amber-600">△ {all.triangle}</span>
            <span className="text-rose-600">X {all.x}</span>
          </p>
          <p className="text-xs text-muted-foreground">O 비율 {pct(all.o, reviewed)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {schools.map((school) => {
          const list = rows.filter((r) => r.school === school);
          const s = sum(list);
          const left = s.drafts - done(s);
          return (
            <details key={school} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-2 font-semibold">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                  {schoolLabel(school)}
                  {s.drafts > 0 && left === 0 && (
                    <span className="rounded bg-emerald-100 px-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      검수 완료
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  설문 {s.completed}/{s.registered} · 검수 {done(s)}/{s.drafts}
                  {left > 0 && <span className="font-medium text-amber-600"> · 남은 {left}</span>}
                </span>
              </summary>
              <div className="overflow-x-auto border-t">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">반</th>
                      <th className="px-3 py-2 text-right font-medium">가입</th>
                      <th className="px-3 py-2 text-right font-medium">설문 완료</th>
                      <th className="px-3 py-2 text-right font-medium">진행중</th>
                      <th className="px-3 py-2 text-right font-medium">미시작</th>
                      <th className="px-3 py-2 text-right font-medium">결과</th>
                      <th className="px-3 py-2 text-right font-medium text-emerald-600">O</th>
                      <th className="px-3 py-2 text-right font-medium text-amber-600">△</th>
                      <th className="px-3 py-2 text-right font-medium text-rose-600">X</th>
                      <th className="px-3 py-2 text-right font-medium">남은</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const rest = r.drafts - done(r);
                      return (
                        <tr
                          key={`${r.grade}-${r.class_no}`}
                          onClick={() =>
                            r.drafts > 0 && onPick({ school, grade: r.grade, class_no: r.class_no })
                          }
                          className={cn(
                            "border-b last:border-0",
                            r.drafts > 0 ? "cursor-pointer hover:bg-muted/60" : "text-muted-foreground"
                          )}
                        >
                          <td className="px-3 py-2 font-medium">{classLabel(r.grade, r.class_no)}</td>
                          <td className="px-3 py-2 text-right">{r.registered}</td>
                          <td className="px-3 py-2 text-right">{r.completed}</td>
                          <td className="px-3 py-2 text-right">{r.in_progress || ""}</td>
                          <td className="px-3 py-2 text-right">{r.not_started || ""}</td>
                          <td className="px-3 py-2 text-right">{r.drafts}</td>
                          <td className="px-3 py-2 text-right">{r.o || ""}</td>
                          <td className="px-3 py-2 text-right">{r.triangle || ""}</td>
                          <td className="px-3 py-2 text-right">{r.x || ""}</td>
                          <td className="px-3 py-2 text-right">
                            {r.drafts === 0 ? (
                              "—"
                            ) : rest === 0 ? (
                              <span className="text-emerald-600">완료</span>
                            ) : (
                              <span className={cn("font-medium", rest < r.drafts && "text-amber-600")}>{rest}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 반 검수 — 한 명씩. O/X는 바로 저장하고 다음 미평가 학생으로 넘어간다.
// △는 이유 칸이 열리고, 저장(Enter)하면 넘어간다. 단축키: 1=O 2=△ 3=X, ←/→ 이동.
// ──────────────────────────────────────────────────────────────

function ClassReview({
  scope,
  call,
  onBack,
  next,
  onNext,
}: {
  scope: Scope;
  call: <T>(fn: (token: string) => Promise<T>) => Promise<T | undefined>;
  onBack: () => void;
  next: Scope | null;
  onNext: (s: Scope) => void;
}) {
  const [items, setItems] = useState<AdminReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);
  // △를 눌러 이유를 적는 중. 저장해야 평가가 기록된다.
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    call((t) => fetchAdminReviews(t, scope)).then((list) => {
      if (!list) return;
      setItems(list);
      // 미평가 첫 학생부터. 다 끝난 반이면 처음부터.
      setIndex(Math.max(0, list.findIndex((d) => !d.verdict)));
    });
  }, [call, scope]);

  const item = items?.[index];

  const go = useCallback(
    (i: number) => {
      if (!items) return;
      setIndex(Math.min(Math.max(i, 0), items.length - 1));
      setReason(null);
    },
    [items]
  );

  const save = useCallback(
    async (verdict: ReviewVerdict | null, why = "") => {
      if (!items || !item) return;
      setBusy(true);
      const updated = await call((t) => putAdminReview(t, item.id, verdict, why));
      setBusy(false);
      if (!updated) return;
      const next = items.map((d) => (d.id === item.id ? updated : d));
      setItems(next);
      setReason(null);
      if (!verdict) return;
      // 이 학생 뒤에서 미평가를 찾고, 없으면 앞에서 찾는다. 다 끝났으면 그대로.
      const after = next.findIndex((d, i) => i > index && !d.verdict);
      const before = next.findIndex((d) => !d.verdict);
      const target = after >= 0 ? after : before;
      if (target >= 0) setIndex(target);
    },
    [call, item, items, index]
  );

  const startTriangle = useCallback(() => {
    if (!item) return;
    setReason(item.verdict === "triangle" ? item.verdict_reason : "");
    setTimeout(() => reasonRef.current?.focus());
  }, [item]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.target instanceof HTMLInputElement) return;
      if (e.key === "1") save("o");
      else if (e.key === "2") startTriangle();
      else if (e.key === "3") save("x");
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, save, startTriangle, go, index]);

  const title = scope.school
    ? `${scope.school} ${classLabel(scope.grade, scope.class_no)}`
    : classLabel(scope.grade, scope.class_no);
  if (!items) return <p className="text-sm text-muted-foreground">{title} 불러오는 중…</p>;
  const doneCount = items.filter((d) => d.verdict).length;
  const allDone = items.length > 0 && doneCount === items.length;
  // v40 키, 없으면 v1 시절 초안의 키.
  const comps = item && (item.raw.career_required_competencies ?? item.raw.competencies);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft /> 현황
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {doneCount}/{items.length} 완료
            {allDone && " — 이 반 검수 끝 🎉"}
          </span>
          {next && (
            <Button size="sm" variant={allDone ? "default" : "outline"} onClick={() => onNext(next)}>
              다음 반: {next.school ? `${next.school} ${classLabel(next.grade, next.class_no)}` : classLabel(next.grade, next.class_no)}
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>

      {/* 반 학생 번호 줄 — 평가 결과가 색으로 보이고 눌러서 이동한다. */}
      <div className="flex flex-wrap gap-1">
        {items.map((d, i) => (
          <button
            key={d.id}
            type="button"
            onClick={() => go(i)}
            title={`${d.student_no}번 ${d.student_name}`}
            className={cn(
              "size-8 rounded-md border text-xs font-medium",
              d.verdict ? VERDICT_STYLE[d.verdict] : "bg-card text-muted-foreground",
              i === index && "ring-2 ring-primary ring-offset-1"
            )}
          >
            {d.student_no || i + 1}
          </button>
        ))}
      </div>

      {item ? (
        <section className="flex flex-col gap-5 rounded-xl border bg-card p-5 lg:flex-row">
          <div className="flex shrink-0 gap-3">
            <Figure src={item.photo_url} label="원본 사진" />
            <Figure
              src={item.image_url ?? FALLBACK_IMAGE}
              label={item.image_url ? "생성 이미지" : "폴백 캐릭터 (생성 이미지 없음)"}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {item.student_no ? `${item.student_no}번 ` : ""}
                {item.student_name}
                {item.status === "approved" && " · 승인됨"}
                {item.status === "rejected" && " · 반려됨"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{item.headline}</p>
              <p className="text-2xl font-bold tracking-tight">{item.base_career}</p>
            </div>
            <p className="leading-relaxed">{item.tagline}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">역량</dt>
              <dd>{Array.isArray(comps) ? comps.join(" · ") : "—"}</dd>
              <dt className="text-muted-foreground">직업 이유</dt>
              <dd>{String(item.raw.career_reason ?? "—")}</dd>
              {item.error && (
                <>
                  <dt className="text-muted-foreground">이미지 오류</dt>
                  <dd className="text-destructive">{item.error}</dd>
                </>
              )}
            </dl>

            <div className="mt-auto flex flex-col gap-2">
              <div className="flex gap-2">
                <VerdictButton active={item.verdict === "o"} style={VERDICT_STYLE.o} disabled={busy} onClick={() => save("o")} hint="1">
                  <Check className="size-6" strokeWidth={3} />
                </VerdictButton>
                <VerdictButton
                  active={item.verdict === "triangle" || reason !== null}
                  style={VERDICT_STYLE.triangle}
                  disabled={busy}
                  onClick={startTriangle}
                  hint="2"
                >
                  <Triangle className="size-6" strokeWidth={3} />
                  <span className="text-[11px] font-medium leading-tight">
                    애매한 사진 결과 (재생성 필요)
                  </span>
                </VerdictButton>
                <VerdictButton active={item.verdict === "x"} style={VERDICT_STYLE.x} disabled={busy} onClick={() => save("x")} hint="3">
                  <X className="size-6" strokeWidth={3} />
                  <span className="text-[11px] font-medium leading-tight">
                    폴백 이미지 (사진 없거나, 이상한 사진)
                  </span>
                </VerdictButton>
              </div>

              {reason !== null ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("triangle", reason.trim());
                  }}
                >
                  <Input
                    ref={reasonRef}
                    value={reason}
                    maxLength={500}
                    placeholder="△ 이유 (예: 직업명이 어색함, 얼굴이 안 닮음)"
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setReason(null)}
                  />
                  <Button type="submit" disabled={busy}>
                    저장
                  </Button>
                </form>
              ) : (
                item.verdict === "triangle" &&
                item.verdict_reason && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">△ 이유: {item.verdict_reason}</p>
                )
              )}

              <div className="flex items-center justify-between text-sm">
                <Button variant="ghost" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
                  <ChevronLeft /> 이전
                </Button>
                {item.verdict && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => save(null)}
                    disabled={busy}
                  >
                    평가 취소 ({VERDICT_MARK[item.verdict]})
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => go(index + 1)}
                  disabled={index === items.length - 1}
                >
                  다음 <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">이 반에는 생성된 결과가 없습니다.</p>
      )}
    </>
  );
}

function VerdictButton({
  active,
  style,
  hint,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  style: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid min-h-14 flex-1 place-items-center gap-0.5 rounded-xl px-2 py-1.5 border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50",
        active && style
      )}
    >
      {children}
      <span className="absolute right-2 top-1 text-[10px] opacity-60">{hint}</span>
    </button>
  );
}

function Figure({ src, label }: { src: string | null; label: string }) {
  return (
    <figure className="flex w-40 flex-col gap-1 sm:w-56">
      <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {src ? (
          <a href={src} target="_blank" rel="noreferrer" className="size-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="size-full object-cover" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">없음</span>
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
