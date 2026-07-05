"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sun, Sparkles, HelpCircle, UserSquare2 } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { CtaButton } from "@/components/voyage/CtaButton";

// 공개 대기함 — Q9까지 응답을 마치면 도착하는 종료 화면.
// 탐험대원증 이름·카드는 한마당에서 공개하므로, 여기서는 "만들어지는 중"만 보여준다.
export default function PendingCardPage() {
  const router = useRouter();
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);

  // 로그인 토큰이 없으면 로그인으로. 복원(hasHydrated) 전에는 판단 보류.
  useEffect(() => {
    if (hasHydrated && !studentToken) router.replace("/login");
  }, [hasHydrated, studentToken, router]);

  if (!hasHydrated || !studentToken) return null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-12 font-sans">
      <ExpeditionBackdrop mood="sunrise" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-md flex-col items-center text-center"
      >
        <div className="glass-card mb-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink shadow-[0_4px_20px_rgba(14,58,79,0.15)]">
          <Sun className="h-4 w-4 text-amber-500" fill="currentColor" />
          공개 대기
        </div>

        <h1 className="mb-3 break-keep text-[1.9rem] font-black leading-tight tracking-tight text-ink">
          탐험대원증이
          <br />
          만들어지고 있어
        </h1>
        <p className="max-w-xs break-keep text-[15px] font-medium leading-relaxed text-ink-soft">
          새벽 바닷바람 속, 네 선택이 하나의 이름으로 새겨지는 중이야. 한마당에서 공개되는 날, 이 자리에서 펼쳐질 거야.
        </p>

        {/* 아직 공개되지 않은 탐험대원증 — 윤곽만 빛나는 물음표 카드 */}
        <div className="relative my-10 flex h-52 w-full items-center justify-center">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-40 w-40 rounded-full bg-amber-300/25 blur-2xl"
              animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.5, 0.9, 0.5] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.7,
                ease: "easeInOut",
              }}
            />
          ))}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex aspect-[3/4.4] w-32 items-center justify-center rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-amber-200 p-2 shadow-[0_16px_40px_rgba(180,120,20,0.28)]"
          >
            <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-amber-300/70">
              <HelpCircle className="h-12 w-12 text-amber-500/80" strokeWidth={2.4} />
            </div>
          </motion.div>
        </div>

        <p className="mb-8 inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-amber-500" fill="currentColor" />
          지금은 윤곽만 빛나고 있어. 조금만 기다려!
        </p>

        <div className="w-full">
          <CtaButton onClick={() => router.push("/profile/me")}>
            <UserSquare2 className="h-5 w-5" />
            탐험 결과 다시 보기
          </CtaButton>

          <button
            type="button"
            onClick={() => router.push("/profile/me")}
            className="mt-5 text-sm font-bold text-ink-muted underline-offset-4 hover:underline"
          >
            탐험 기록 보기
          </button>
        </div>
      </motion.div>
    </main>
  );
}
