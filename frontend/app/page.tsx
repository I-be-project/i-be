"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Compass, LogOut, Sparkles } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { getMyProfile } from "@/lib/api";
import { resumeScreen, resumePath } from "@/lib/explore/flow";
import { AboutSheet } from "@/components/welcome/AboutSheet";

export default function WelcomePage() {
  const router = useRouter();
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);
  const studentInfo = useSessionStore((s) => s.studentInfo);
  const reset = useSessionStore((s) => s.reset);

  // 로그인 상태면 인사에 쓸 실제 이름을 백엔드에서 가져온다(studentInfo는 이전 학생 값이
  // 남아 있을 수 있어 신뢰하지 않고, 로딩 중/실패 시 폴백으로만 쓴다).
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  useEffect(() => {
    if (!hasHydrated || !studentToken) return;
    let alive = true;
    getMyProfile(studentToken)
      .then((p) => {
        if (alive && p.student?.name) setFetchedName(p.student.name);
      })
      .catch(() => {
        /* 네트워크 실패 시 studentInfo 폴백 유지 */
      });
    return () => {
      alive = false;
    };
  }, [hasHydrated, studentToken]);

  const loggedIn = hasHydrated && Boolean(studentToken);
  const name = fetchedName ?? studentInfo?.name ?? null;

  const [aboutOpen, setAboutOpen] = useState(false);

  // 라벨은 기존 문구("내 탐험 시작하기") 그대로, 목적지만 진행상황에 따라 갈린다.
  const goSurvey = () => {
    const screen = resumeScreen(useSessionStore.getState());
    if (screen !== "explore")
      return router.push(resumePath(useSessionStore.getState()));
    return router.push("/explore");
  };

  const handleLogout = () => {
    reset();
    setFetchedName(null);
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      {/* 배경 이미지 (히어로) — 항상 화면을 여백 없이 꽉 채운다(object-cover, 중앙 기준).
          세로가 긴 화면(좁은 화면)에서는 세로 기준으로 채워지며 좌우가 잘리고,
          가로가 긴 화면(넓은 화면)에서는 가로 기준으로 채워지며 위아래가 잘린다. */}
      <div className="absolute inset-0 overflow-hidden bg-[#49a7e0]">
        <Image
          src="/welcome.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* 상단 스크림 — 헤드라인 가독성 */}
        <div className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-white/70 via-white/25 to-transparent" />
        {/* 하단 스크림 — CTA 가독성 */}
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-white/90 via-white/55 to-transparent" />
      </div>

      {/* 상단: 배지(=체험 안내 버튼) + 헤드라인 */}
      <div className="relative z-10 flex flex-col items-center px-7 pt-14 text-center">
        <motion.button
          type="button"
          onClick={() => setAboutOpen(true)}
          aria-label="체험 안내 보기"
          initial={{ opacity: 0, y: -12 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: [1, 1.045, 1],
            boxShadow: [
              "0 4px 20px rgba(14,58,79,0.15)",
              "0 8px 30px rgba(56,189,248,0.4)",
              "0 4px 20px rgba(14,58,79,0.15)",
            ],
          }}
          transition={{
            opacity: { duration: 0.5 },
            y: { duration: 0.5 },
            scale: {
              duration: 2.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            },
            boxShadow: {
              duration: 2.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            },
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9, rotate: -2 }}
          className="glass-card group relative mb-7 inline-flex items-center gap-1.5 overflow-hidden rounded-full py-2 pl-4 pr-3 text-sm font-bold text-[#0e3a4f]"
        >
          {/* 반짝 스치는 하이라이트 — 주기적으로 왼쪽에서 오른쪽으로 훑고 지나간다 */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent"
            animate={{ x: ["-140%", "240%"] }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              repeatDelay: 1.8,
              ease: "easeInOut",
            }}
          />
          <span className="relative z-10">2026 나Be한마당</span>
          <motion.span
            className="relative z-10 flex"
            animate={{ rotate: [0, 18, -12, 0], scale: [1, 1.25, 1] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              repeatDelay: 1.2,
              ease: "easeInOut",
            }}
          >
            <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
          </motion.span>
        </motion.button>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-[2.7rem] font-black leading-[1.14] tracking-tight text-[#0d3047] drop-shadow-[0_2px_10px_rgba(255,255,255,0.6)]"
        >
          어떤
          <br />
          <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
            미래
          </span>
          를
          <br />
          꿈꾸고 있니?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-5 max-w-xs text-base font-semibold leading-relaxed text-[#1d4a5e] drop-shadow-[0_1px_6px_rgba(255,255,255,0.55)]"
        >
          지도를 펼치듯, 섬 너머로 이어질
          <br />
          나만의 이야기를 찾아가자.
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
        {loggedIn ? (
          <>
            <div className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#1d4a5e] drop-shadow-[0_1px_6px_rgba(255,255,255,0.65)]">
              {name ? `${name}님, 반가워요!` : "다시 만나서 반가워요!"}
            </div>

            <button
              type="button"
              onClick={goSurvey}
              className="group flex h-16 w-full max-w-md items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-lg font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.42)] transition-all hover:shadow-[0_18px_44px_rgba(37,99,235,0.52)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
            >
              탐험 시작하기
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#1d4a5e] underline-offset-4 hover:underline"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#1d4a5e] drop-shadow-[0_1px_6px_rgba(255,255,255,0.65)]">
              <Compass className="h-4 w-4 text-sky-500" />
              나로섬으로 떠나는 여정을 시작해
            </div>

            <button
              type="button"
              onClick={() => router.push("/signup")}
              className="group flex h-16 w-full max-w-md items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-lg font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.42)] transition-all hover:shadow-[0_18px_44px_rgba(37,99,235,0.52)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
            >
              탐험 시작하기
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-5 text-sm font-bold text-[#1d4a5e] underline-offset-4 hover:underline"
            >
              이미 계정이 있어 · 로그인
            </button>
          </>
        )}
      </motion.div>

      {/* "체험 안내" 시트 — 상단 배지를 탭하면 아래에서 올라온다 */}
      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
    </main>
  );
}
