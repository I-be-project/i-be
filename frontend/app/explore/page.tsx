"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Compass, MapPin, Sun, Moon, Sparkles } from "lucide-react";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { useSessionStore } from "@/store/useSessionStore";
import { briefingCampMapAsset } from "@/lib/assets/sceneManifest";

const JOURNEY_STEPS = [
  {
    step: 1,
    Icon: MapPin,
    title: "선착장 · 브리핑",
    desc: "캠프 지도를 펼치고, 오늘 코스를 들어요",
  },
  {
    step: 2,
    Icon: Sun,
    title: "낮 탐험 6장면",
    desc: "팀과 함께 섬을 돌며, 장면마다 하나를 골라요. 정답은 없어요",
  },
  {
    step: 3,
    Icon: Moon,
    title: "별빛 프로그램",
    desc: "해가 지면 등불이 켜지고, 캠프 12곳이 하나씩 열려요",
  },
] as const;

// 탐험 브리핑 — 나로섬 도착 장면. Q1~6 스토리의 도입부를 여기서 연다.
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
    <main className="relative flex min-h-[100dvh] flex-col bg-sand font-sans">
      <FullBleedScene asset={briefingCampMapAsset} heightClass="h-[62vh] min-h-[320px]" priority>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/65 via-white/20 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center px-6 text-center"
        >
          <div className="glass-card mb-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink">
            <Compass className="h-4 w-4 text-sky-500" />
            탐험 브리핑 · 입항
          </div>
          <h1 className="text-[1.9rem] font-black leading-tight tracking-tight text-ink drop-shadow-sm">
            나로섬에 도착했어!
          </h1>
          <p className="mt-2 max-w-xs text-[15px] font-semibold leading-relaxed text-ink-soft">
            바닷바람과 함께 캠프가 보여. 오늘은 팀과 섬을 돌고,
            <br />
            밤에는 별빛 프로그램이 열려.
          </p>
        </motion.div>
      </FullBleedScene>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="relative z-10 -mt-5 flex flex-1 flex-col rounded-t-[1.75rem] bg-sand px-6 pb-10 pt-7"
      >
        <p className="mb-4 text-center text-sm font-bold text-ink-muted">
          오늘의 탐험 루트
        </p>

        <div className="mb-6 flex flex-col gap-2.5">
          {JOURNEY_STEPS.map(({ step, Icon, title, desc }, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="glass-card flex items-center gap-3.5 rounded-2xl p-4"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-extrabold text-white">
                {step}
              </span>
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Icon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="flex min-w-0 flex-col text-left">
                <span className="text-[15px] font-extrabold text-ink">{title}</span>
                <span className="text-sm font-medium leading-snug text-ink-muted">{desc}</span>
              </span>
            </motion.div>
          ))}
        </div>

        <p className="mb-8 inline-flex items-center justify-center gap-1.5 text-center text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
          준비됐다면, 낮 탐험 첫 장면으로!
        </p>

        <div className="mt-auto">
          <CtaButton onClick={() => router.push("/explore/questions")}>
            <Compass className="h-5 w-5" />
            낮 탐험 시작하기
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
