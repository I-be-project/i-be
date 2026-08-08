"use client";

import { AlertTriangle, Check, ImageOff, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SURVEY_STAGES } from "@/components/admin/ProgressBadge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

export function StudentDetailSidebar({
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
    <Sheet
      open={student !== null}
      // 비모달 — 사이드바를 연 채로 뒤의 목록·좌석표를 그대로 클릭할 수 있다.
      // 다른 학생을 누르면 닫히지 않고 내용만 교체된다.
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        // 바깥 클릭·포커스 이탈로는 닫지 않는다. 뒤의 목록에서 다른 학생을 누르는 것이
        // 주된 사용 방식인데, 그 클릭이 "바깥 클릭 = 닫기"로도 해석되면 닫힘과 새 선택이
        // 경쟁해 사이드바가 사라진다. 닫기는 ESC와 × 버튼으로만 한다.
        if (details.reason === "outside-press" || details.reason === "focus-out") {
          return;
        }
        onClose();
      }}
    >
      <SheetContent
        side="right"
        showOverlay={false}
        // 기본 폭이 sm:max-w-sm(384px)이라 좁다. 접두사 없는 sm:max-w-xl은
        // data-[side=right]:sm:max-w-sm보다 특이도가 낮아 밀리므로 접두사를 맞춘다.
        // 스크롤은 SheetContent가 아니라 아래 내부 래퍼에서 처리한다 — 여기서 하면
        // × 닫기 버튼(Popup 안쪽에 absolute로 붙음)이 스크롤을 따라 함께 밀려 사라진다.
        className="gap-0 p-0 data-[side=right]:sm:max-w-xl"
      >
        {student && (
          // Popup이 flex flex-col이라 flex-1이 남은 세로 공간을 모두 차지하고,
          // 그 안에서만 스크롤해 × 버튼은 항상 같은 자리에 고정된다.
          <div className="flex-1 overflow-y-auto">
            {/* 사진 — 목록은 사진 URL을 받지 않으므로 상세 응답에서 읽는다.
                정사각 틀 + object-contain이라 어떤 비율이든 잘리지 않는다. 카메라로 찍은
                사진은 720x720이라 여백 없이 맞고, 갤러리에서 고른 사진만 여백이 생긴다.
                로딩·사진없음 상태도 같은 정사각 틀을 써서 전환 시 높이가 튀지 않게 한다. */}
            <div className="relative flex aspect-square w-full items-center justify-center bg-muted">
              {detailError ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              ) : loadingDetail || detail?.id !== student.id ? (
                // detail이 아직 이전 학생 것이거나 로딩 중이면 스켈레톤을 보여준다.
                // (학생을 바꿔도 사이드바가 언마운트되지 않으므로, id가 다르면
                // 이전 학생의 사진이 새 이름과 함께 잠깐 보이는 것을 막아야 한다.)
                <Skeleton className="size-full rounded-none" />
              ) : detail.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.photo_url}
                  alt={`${student.name} 사진`}
                  // absolute + inset-0으로 흐름에서 빼야 한다 — size-full만 쓰면
                  // 세로가 긴 사진(예: 3:4 인물사진)에서 img의 auto 높이가 정사각 틀의
                  // 콘텐츠 기반 최소 높이로 반영되어 aspect-square를 밀어낸다.
                  className="absolute inset-0 size-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              )}
            </div>

            <div className="p-6">
              <SheetHeader className="mb-1 gap-0.5 p-0 text-left">
                {/* 열린 채로 다른 학생으로 바뀔 때 포커스 이동이 없어 스크린리더가
                    조용히 넘어간다. aria-live로 이름 교체를 알린다. */}
                <SheetTitle className="text-xl" aria-live="polite">
                  {student.name}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {student.kind === "test"
                    ? "테스트 계정"
                    : student.school || "개인 참여자"}
                </p>
              </SheetHeader>

              <dl className="mt-3 divide-y divide-border">
                {/* 학교 소속 학생만 학년·반·번호가 의미 있다. 개인 참여자·테스트 계정은
                    school이 비어 있고 학년·반·번호도 전부 0이라 행 자체를 생략한다.
                    Step 1 프로필과 같은 조건(school 유무)을 쓴다. */}
                {student.school && (
                  <Field label="학년·반·번호">
                    <span className="tabular-nums">
                      {student.grade}학년 {student.class_no}반 {student.student_no}번
                    </span>
                  </Field>
                )}
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
                {detailError ? (
                  <p className="text-sm text-destructive">{detailError}</p>
                ) : loadingDetail || detail?.id !== student.id ? (
                  // 사진 틀과 동일한 조건 — student prop이 바뀐 첫 렌더에는
                  // useEffect의 초기화(setDetail(null) 등)가 아직 실행되기 전이라
                  // detail이 이전 학생 것일 수 있다. 그대로 두면 새 이름 아래에
                  // 이전 학생의 페르소나·카드·답변이 한 프레임 동안 노출된다.
                  <div className="space-y-2">
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
