"use client";

// /b/<code> — 부스 QR을 찍으면 열리는 화면.
//
// 이 페이지는 폰 기본 카메라 앱에서 열리는 경로라, 설문을 진행하던 브라우저가 아닐 수 있다.
// 그래서 흐름 가드(useFlowGuard)를 쓰지 않는다. 가드가 보는 진행 상태는 localStorage에만
// 있어서 새 브라우저에서는 비어 있고, 카드를 이미 받은 학생도 가입 화면으로 튕겨나간다.
// 여기서는 "토큰이 있는가"만 보고, 카드 발급 여부 판정은 서버(403)에 맡긴다.

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, Check, Compass, MapPin } from "lucide-react";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";
import { useSessionStore } from "@/store/useSessionStore";
import {
  ApiError,
  checkInBooth,
  fetchBoothByCode,
  type StudentBooth,
} from "@/lib/api";
import { resumePath } from "@/lib/explore/flow";

type PageState =
  | { kind: "loading" }
  // 카드 발급 전(403) — 탐험을 마쳐야 인증할 수 있다.
  | { kind: "blocked"; message: string }
  // 없는 코드(404) — QR이 잘못됐거나 부스가 삭제됐다.
  | { kind: "notfound"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; booth: StudentBooth };

function formatVisitedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BoothCheckInPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);
  const studentId = useSessionStore((s) => s.studentId);
  // 인증을 마치면 프로필로 보낸다. /profile/[id]의 id는 표시용 세그먼트일 뿐이고
  // 화면은 토큰으로 /students/me를 조회하므로, 저장된 id가 없어도 "me"로 열면 된다.
  // (예전 localStorage 세션엔 studentId가 없어 홈으로 떨어지던 문제)
  const doneHref = `/profile/${studentId ?? "me"}`;

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [checkingIn, setCheckingIn] = useState(false);
  // 이번 탭에서 방금 기록했는지(true) 원래 기록이 있었는지(false) — 문구만 달라진다.
  const [justRecorded, setJustRecorded] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return; // localStorage 복원 전에는 판단 보류
    if (!studentToken) {
      // 로그인 후 이 페이지로 돌아와 이어서 인증한다. QR을 다시 찍게 하지 않는다.
      router.replace(`/login?next=${encodeURIComponent(`/b/${code}`)}`);
      return;
    }

    let active = true;
    setState({ kind: "loading" });
    fetchBoothByCode(studentToken, code)
      .then((booth) => {
        if (active) setState({ kind: "ready", booth });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/b/${code}`)}`);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setState({ kind: "blocked", message: err.message });
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "notfound", message: err.message });
          return;
        }
        setState({
          kind: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "부스 정보를 불러오지 못했어. 잠시 후 다시 시도해줘.",
        });
      });

    return () => {
      active = false;
    };
  }, [hasHydrated, studentToken, code, router]);

  const handleCheckIn = useCallback(async () => {
    if (!studentToken || checkingIn) return;
    if (state.kind !== "ready") return;
    const booth = state.booth;

    setCheckingIn(true);
    try {
      const res = await checkInBooth(studentToken, code);
      setJustRecorded(!res.already_visited);
      setState({
        kind: "ready",
        booth: { ...booth, visited: true, visited_at: res.visited_at },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/b/${code}`)}`);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setState({ kind: "blocked", message: err.message });
        return;
      }
      setState({
        kind: "error",
        message:
          err instanceof ApiError
            ? err.message
            : "방문을 기록하지 못했어. 잠시 후 다시 시도해줘.",
      });
    } finally {
      setCheckingIn(false);
    }
  }, [studentToken, checkingIn, state, code, router]);

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      <VoyageBackground variant="soft" />

      <div className="relative z-10 px-7 pb-8 pt-16">
        <p className="mb-2 text-sm font-bold tracking-wide text-sky-600">
          부스 방문 인증
        </p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-ink">
          {state.kind === "ready" && state.booth.visited
            ? "기록했어!"
            : "여기 들렀구나"}
        </h1>
      </div>

      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mt-auto flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-8 pt-7 shadow-[0_-12px_40px_rgba(80,70,140,0.12)]"
      >
        {(state.kind === "loading" || !hasHydrated) && (
          <p className="py-10 text-center text-sm font-medium text-zinc-500">
            부스를 확인하는 중...
          </p>
        )}

        {state.kind === "blocked" && (
          <div className="flex flex-1 flex-col">
            <div className="rounded-2xl border border-solid border-amber-200 bg-amber-50 px-4 py-4">
              <div className="flex items-start gap-2.5">
                <Compass className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm font-medium leading-relaxed text-amber-800">
                  {state.message}
                </p>
              </div>
            </div>
            <div className="mt-auto pt-8">
              <CtaButton onClick={() => router.replace(resumePath(useSessionStore.getState()))}>
                탐험 이어하기
              </CtaButton>
            </div>
          </div>
        )}

        {(state.kind === "notfound" || state.kind === "error") && (
          <div className="flex flex-1 flex-col">
            <div className="rounded-2xl border border-solid border-red-200 bg-red-50 px-4 py-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm font-medium leading-relaxed text-red-600">
                  {state.message}
                </p>
              </div>
            </div>
            <div className="mt-auto pt-8">
              <CtaButton onClick={() => router.replace("/")}>
                처음으로
              </CtaButton>
            </div>
          </div>
        )}

        {state.kind === "ready" && (
          <div className="flex flex-1 flex-col">
            <div className="rounded-3xl border border-solid border-zinc-200 bg-zinc-50 px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100">
                  {state.booth.visited ? (
                    <Check className="h-5 w-5 text-sky-600" />
                  ) : (
                    <MapPin className="h-5 w-5 text-sky-600" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-black leading-snug text-ink">
                    {state.booth.name}
                  </p>
                  {state.booth.description && (
                    <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-muted">
                      {state.booth.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs font-bold tracking-widest text-zinc-400">
                    {state.booth.code}
                  </p>
                </div>
              </div>
            </div>

            {state.booth.visited && (
              <div className="mt-4 rounded-2xl border border-solid border-sky-200 bg-sky-50 px-4 py-3.5">
                <p className="text-sm font-bold text-sky-700">
                  {justRecorded
                    ? "방문 기록을 남겼어."
                    : "이미 방문 기록이 있는 부스야."}
                </p>
                {state.booth.visited_at && (
                  <p className="mt-1 text-xs font-medium text-sky-600">
                    {formatVisitedAt(state.booth.visited_at)}
                  </p>
                )}
              </div>
            )}

            <div className="mt-auto pt-8">
              {state.booth.visited ? (
                <CtaButton onClick={() => router.replace(doneHref)}>
                  프로필로 가기
                </CtaButton>
              ) : (
                <CtaButton onClick={handleCheckIn} disabled={checkingIn}>
                  {checkingIn ? "기록하는 중..." : "방문 기록하기"}
                </CtaButton>
              )}
            </div>
          </div>
        )}
      </motion.section>
    </main>
  );
}
