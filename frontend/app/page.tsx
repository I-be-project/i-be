"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";

// 페르소나 카드 안의 발광하는 머리 실루엣 + 스파클 글리프(시그니처 요소).
function PersonaGlyph() {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      {/* 인디고 후광 — 흰 실루엣이 대비되도록 */}
      <div
        className="absolute inset-0 rounded-full blur-md"
        style={{
          background:
            "radial-gradient(circle, rgba(120,90,235,0.85) 0%, rgba(150,110,240,0.45) 45%, rgba(150,110,240,0) 72%)",
        }}
      />
      {/* 궤도 링 */}
      <div className="absolute inset-1 rounded-full border border-white/50" />
      <div className="absolute inset-3 rounded-full border border-white/30" />
      <svg viewBox="0 0 72 72" className="relative h-16 w-16 drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]">
        {/* 머리 */}
        <circle cx="36" cy="27" r="15" fill="white" />
        {/* 어깨 */}
        <path d="M13 66 C13 51 23 45 36 45 C49 45 59 51 59 66 Z" fill="white" />
        {/* 내면의 스파클 */}
        <path
          d="M36 17 C36 23 39 26 45 26 C39 26 36 29 36 35 C36 29 33 26 27 26 C33 26 36 23 36 17 Z"
          fill="#9b7df0"
        />
      </svg>
      {/* 작은 스파클 */}
      <Sparkles className="absolute right-1 top-2 h-4 w-4 text-white/90" fill="currentColor" />
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-10 font-sans">
      <CelestialBackground />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* 배지 */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card mb-8 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-indigo-700 shadow-[0_4px_20px_rgba(99,102,241,0.15)]"
        >
          <Sparkles className="h-4 w-4 text-indigo-500" fill="currentColor" />
          2026 나Be한마당
        </motion.div>

        {/* 헤드라인 */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-[2.6rem] font-black leading-[1.15] tracking-tight text-[#2a2550] drop-shadow-[0_2px_8px_rgba(255,255,255,0.4)]"
        >
          너는 어떤
          <br />
          <span className="text-aurora">미래</span>를
          <br />
          살아보고 싶니?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 text-base font-semibold text-[#5b5685]"
        >
          너의 가능성을 발견하고, 꿈을 현실로 만들어가자!
        </motion.p>

        {/* 떠다니는 페르소나 카드 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, type: "spring", stiffness: 120, damping: 16 }}
          className="relative mt-10 mb-10"
        >
          {/* 받침대 글로우 */}
          <div className="absolute -bottom-6 left-1/2 h-10 w-44 -translate-x-1/2 rounded-[100%] bg-white/70 blur-xl" />

          <div className="animate-floaty glass-card relative flex w-56 flex-col items-center rounded-[2rem] px-6 py-8 shadow-[0_20px_50px_rgba(123,97,240,0.25)] ring-1 ring-white/60">
            <PersonaGlyph />
            <h2 className="mt-4 text-lg font-extrabold text-indigo-700">나의 페르소나 카드</h2>
            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-[#6f699a]">
              아직 발견되지 않은
              <br />
              너의 모습이 기다리고 있어!
            </p>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="w-full"
        >
          <button
            type="button"
            onClick={() => router.push("/signup")}
            className="group flex h-16 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-lg font-bold text-white shadow-[0_12px_30px_rgba(124,77,229,0.4)] transition-all hover:shadow-[0_16px_40px_rgba(124,77,229,0.5)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            <Sparkles className="h-5 w-5" fill="currentColor" />
            내 페르소나 찾기 시작
            <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-6 text-sm font-bold text-[#5b5685] underline-offset-4 hover:underline"
          >
            로그인
          </button>
        </motion.div>
      </div>
    </main>
  );
}
