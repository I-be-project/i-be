"use client";

import { AlertTriangle, Check, ImageOff, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SURVEY_STAGES } from "@/components/admin/ProgressBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  deleteAdminStudent,
  fetchAdminStudentDetail,
  type AdminSessionDetail,
  type AdminStudentDetail,
  type AdminStudentItem,
} from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { genderLabel } from "@/lib/utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/** 설문 단계 스텝퍼 — 완료된 단계는 채워서 표시. */
function StageStepper({
  stagesDone,
  completed,
}: {
  stagesDone: string[];
  completed: boolean;
}) {
  const steps = [
    ...SURVEY_STAGES.map((s) => ({
      label: s.label,
      done: stagesDone.includes(s.key),
    })),
    { label: "완료", done: completed },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <span
          key={i}
          className={
            step.done
              ? "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {step.done && <Check className="size-3" aria-hidden />}
          {step.label}
        </span>
      ))}
    </div>
  );
}

/** 한 답변 payload를 읽기 쉽게 렌더. */
function AnswerPayload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload);
  if (entries.length === 0)
    return <span className="text-xs text-muted-foreground">(내용 없음)</span>;
  return (
    <dl className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-xs">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd className="break-all font-medium">
            {typeof v === "string" || typeof v === "number"
              ? String(v)
              : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 한 세션(설문 1회 시도)의 결과·내용. */
function SessionBlock({ session }: { session: AdminSessionDetail }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {session.status === "completed"
            ? "완료"
            : session.status === "in_progress"
              ? "진행중"
              : session.status}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {new Date(session.created_at).toLocaleString("ko-KR")}
        </span>
      </div>

      {session.persona && (
        <div className="mb-3 rounded-md bg-muted/50 p-3">
          <p className="text-sm font-semibold">{session.persona.name}</p>
          {session.persona.tagline && (
            <p className="text-xs text-muted-foreground">{session.persona.tagline}</p>
          )}
          {session.persona.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {session.persona.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full bg-background px-2 py-0.5 text-xs ring-1 ring-inset ring-border"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
          {session.persona.fields.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              분야: {session.persona.fields.join(", ")}
            </p>
          )}
        </div>
      )}

      {session.card_image_url && (
        // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.card_image_url}
          alt="발급 카드"
          className="mb-3 w-full rounded-md object-contain"
        />
      )}

      {session.answers.length > 0 ? (
        <div className="space-y-2">
          {session.answers.map((a) => (
            <div key={a.stage} className="rounded-md border p-2">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {a.stage}
              </p>
              <AnswerPayload payload={a.payload} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">저장된 답변이 없습니다.</p>
      )}
    </div>
  );
}

export function StudentDetailDialog({
  student,
  onClose,
  onDeleted,
}: {
  student: AdminStudentItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminStudentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const studentId = student?.id ?? null;

  useEffect(() => {
    if (!studentId) return;
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    let alive = true;
    // 학생이 바뀌면 이전 상세·확인 상태를 초기화하고 새로 로드한다.
    // effect 내 동기 setState는 의도된 초기화 — 이 블록에서만 규칙을 끈다.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDetail(null);
    setDetailError(null);
    setConfirming(false);
    setActionError(null);
    setLoadingDetail(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchAdminStudentDetail(token, studentId)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setDetailError(
          err instanceof ApiError ? err.message : "상세 정보를 불러오지 못했습니다."
        );
      })
      .finally(() => {
        if (alive) setLoadingDetail(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId, router]);

  async function handleDelete() {
    if (!student) return;
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setDeleting(true);
    setActionError(null);
    try {
      await deleteAdminStudent(token, student.id);
      onDeleted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setActionError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        {student && (
          <>
            {/* 사진 헤더 — 목록은 사진 URL을 받지 않으므로 상세 응답에서 읽는다. */}
            <div className="relative flex h-64 items-center justify-center bg-muted">
              {loadingDetail ? (
                <Skeleton className="size-full rounded-none" />
              ) : detail?.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.photo_url}
                  alt={`${student.name} 사진`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              )}
            </div>

            <div className="p-6">
              <DialogHeader className="mb-1 space-y-1 text-left">
                <DialogTitle className="text-xl">{student.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{student.school}</p>
              </DialogHeader>

              <dl className="mt-3 divide-y divide-border">
                <Field label="학년·반·번호">
                  <span className="tabular-nums">
                    {student.grade}학년 {student.class_no}반 {student.student_no}번
                  </span>
                </Field>
                <Field label="성별">{genderLabel(student.gender)}</Field>
                <Field label="비밀번호">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono">
                    {student.password}
                  </span>
                </Field>
                <Field label="개인정보 동의">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={
                        student.consent_privacy
                          ? "size-1.5 rounded-full bg-emerald-500"
                          : "size-1.5 rounded-full bg-muted-foreground/40"
                      }
                      aria-hidden
                    />
                    {student.consent_privacy ? "동의" : "미동의"}
                  </span>
                </Field>
                <Field label="가입일">
                  <span className="tabular-nums">
                    {new Date(student.created_at).toLocaleString("ko-KR")}
                  </span>
                </Field>
              </dl>

              {/* 설문 진행 단계 */}
              <section className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  설문 진행
                </h3>
                <StageStepper
                  stagesDone={student.progress.stages_done}
                  completed={student.progress.status === "completed"}
                />
              </section>

              {/* 결과·내용 */}
              <section className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  결과 · 내용
                </h3>
                {loadingDetail ? (
                  <div className="space-y-2">
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                ) : detailError ? (
                  <p className="text-sm text-destructive">{detailError}</p>
                ) : detail && detail.sessions.length > 0 ? (
                  <div className="space-y-3">
                    {detail.sessions.map((s) => (
                      <SessionBlock key={s.id} session={s} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    아직 설문을 시작하지 않았습니다.
                  </p>
                )}
              </section>

              {/* 삭제 영역 */}
              <section className="mt-6 border-t border-destructive/20 pt-4">
                {actionError && (
                  <p className="mb-2 text-sm text-destructive">{actionError}</p>
                )}
                {!confirming ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full gap-1.5"
                    onClick={() => setConfirming(true)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    회원 삭제
                  </Button>
                ) : (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <p className="mb-3 flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        정말 삭제할까요? 설문 답변·페르소나·카드와 사진까지 모두
                        영구 삭제되며 되돌릴 수 없습니다.
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1 gap-1.5"
                        disabled={deleting}
                        onClick={handleDelete}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {deleting ? "삭제 중…" : "영구 삭제"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 gap-1.5"
                        disabled={deleting}
                        onClick={() => setConfirming(false)}
                      >
                        <X className="size-4" aria-hidden />
                        취소
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
