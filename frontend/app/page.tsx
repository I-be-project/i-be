"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Compass, Sparkles } from "lucide-react";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      {/* 배경 이미지 (히어로) — 16:9. 세로는 항상 화면 높이에 꽉 차고(세로 확대/크롭 없음),
          가로는 중앙 기준. 화면을 넓히면 전체가 드러나고, 더 넓어지면 좌우에 여백이 생긴다
          (여백은 배경색으로 채움). 좁히면 좌우가 중앙 기준으로 점점 잘림. 비율 유지. */}
      <div className="absolute inset-0 overflow-hidden bg-[#49a7e0]">
        <Image
          src="/welcome-bg.png"
          alt=""
          width={1672}
          height={941}
          priority
          sizes="1672px"
          className="absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2"
        />
        {/* 상단 스크림 — 헤드라인 가독성 */}
        <div className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-white/70 via-white/25 to-transparent" />
        {/* 하단 스크림 — CTA 가독성 */}
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-white/90 via-white/55 to-transparent" />
      </div>

      {/* 상단: 배지 + 헤드라인 */}
      <div className="relative z-10 flex flex-col items-center px-7 pt-14 text-center">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card mb-7 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-[#0e3a4f] shadow-[0_4px_20px_rgba(14,58,79,0.15)]"
        >
          <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
          2026 나Be한마당
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-[2.7rem] font-black leading-[1.14] tracking-tight text-[#0d3047] drop-shadow-[0_2px_10px_rgba(255,255,255,0.6)]"
        >
          너는 어떤
          <br />
          <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
            미래
          </span>
          를
          <br />
          살아보고 싶니?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 max-w-xs text-base font-semibold leading-relaxed text-[#1d4a5e] drop-shadow-[0_1px_6px_rgba(255,255,255,0.55)]"
        >
          지도를 펼치듯, 너의 가능성을 발견하고
          <br />
          꿈을 현실로 만들어가자!
        </motion.p>
      </div>

      {/* 가운데: 배경 속 소녀가 보이도록 비워 둠 */}
      <div className="flex-1" />

      {/* 하단: CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="relative z-10 flex flex-col items-center px-7 pb-10"
      >
        <div className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#1d4a5e] drop-shadow-[0_1px_6px_rgba(255,255,255,0.65)]">
          <Compass className="h-4 w-4 text-sky-500" />
          나를 찾는 여정을 시작해
        </div>

        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="group flex h-16 w-full max-w-md items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-lg font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.42)] transition-all hover:shadow-[0_18px_44px_rgba(37,99,235,0.52)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <Sparkles className="h-5 w-5" fill="currentColor" />
          내 페르소나 찾기 시작
          <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-5 text-sm font-bold text-[#1d4a5e] underline-offset-4 hover:underline"
        >
          이미 계정이 있어 · 로그인
        </button>
      </motion.div>
    </main>
  );
}
