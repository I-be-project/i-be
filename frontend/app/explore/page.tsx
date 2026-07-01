"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";
import { useSessionStore } from "@/store/useSessionStore";

export default function ExplorePage() {
  const router = useRouter();
  // 완료 저장은 인증이 필요하므로 설문 시작 전에 로그인 토큰이 있어야 한다.
  const studentToken = useSessionStore((s) => s.studentToken);
  useEffect(() => {
    if (!studentToken) router.replace("/login");
  }, [studentToken, router]);
  if (!studentToken) return null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden p-6 font-sans">
      <CelestialBackground variant="soft" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mb-10 text-center"
      >
        <div className="mb-3 inline-block rounded-full border border-solid border-white/70 bg-white/70 px-3 py-1 text-xs font-bold tracking-wider text-indigo-700">
          STEP 01
        </div>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-solid border-white/70 bg-white/70 shadow-[0_8px_24px_rgba(124,77,229,0.15)]">
          <Sparkles className="h-7 w-7 text-indigo-500" fill="currentColor" />
        </div>
        <h1 className="mb-3 text-2xl font-extrabold text-[#2a2550] md:text-3xl">
          여섯 가지 질문에 답해볼까요?
        </h1>
        <p className="font-medium leading-relaxed text-[#5b5685]">
          정답은 없어요. 떠오르는 대로 자유롭게 적으면<br />
          너에게 어울리는 진로 페르소나를 찾아줄게요.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <Button
          size="lg"
          onClick={() => router.push("/explore/questions")}
          className="h-14 w-full rounded-2xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-bold text-white shadow-[0_10px_24px_rgba(124,77,229,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_14px_30px_rgba(124,77,229,0.4)] active:scale-[0.98]"
        >
          설문 시작하기
        </Button>
      </motion.div>
    </main>
  );
}
