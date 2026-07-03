"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Compass, Map, Sparkles } from "lucide-react";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { CtaButton } from "@/components/voyage/CtaButton";
import { useSessionStore } from "@/store/useSessionStore";
import { explorationIntro } from "@/lib/mock/questions";

// 탐험 브리핑 — 나비섬 도착 장면. Q1~6 스토리의 도입부를 여기서 연다.
export default function ExplorePage() {
  const router = useRouter();
  // 완료 저장은 인증이 필요하므로 설문 시작 전에 로그인 토큰이 있어야 한다.
  // hasHydrated 전에는 localStorage 복원 중이므로 판단을 보류(성급한 /login 튕김 방지).
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);
  useEffect(() => {
    if (hasHydrated && !studentToken) router.replace("/login");
  }, [hasHydrated, studentToken, router]);
  if (!hasHydrated || !studentToken) return null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      <ExpeditionBackdrop mood="morning" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-12">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center"
        >
          <div className="glass-card mb-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink shadow-[0_4px_20px_rgba(14,58,79,0.15)]">
            <Map className="h-4 w-4 text-sky-500" />
            탐험 브리핑
          </div>

          <div className="glass-card mb-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-[0_8px_24px_rgba(37,99,235,0.18)]">
            <Compass className="h-8 w-8 text-sky-500" />
          </div>

          <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-ink">
            나비섬에 도착했어!
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="glass-card mt-7 rounded-3xl p-5"
        >
          <p className="text-[15px] font-medium leading-relaxed text-ink-soft">
            {explorationIntro}
          </p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-5 inline-flex items-center justify-center gap-1.5 text-center text-sm font-bold text-ink-soft"
        >
          <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
          여섯 장면의 선택이 너의 페르소나를 그려줄 거야
        </motion.p>

        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <CtaButton onClick={() => router.push("/explore/questions")}>
            <Compass className="h-5 w-5" />
            탐험 시작하기
          </CtaButton>
        </motion.div>
      </div>
    </main>
  );
}
