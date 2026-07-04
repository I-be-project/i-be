"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Moon, Sparkles, Hammer, Mic2, Palette, ArrowRight } from "lucide-react";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { useSessionStore } from "@/store/useSessionStore";
import { eveningBridgeAsset } from "@/lib/assets/sceneManifest";
import { campTraditionIntro } from "@/lib/mock/campMap";

const EVENING_SPOTS = [
  {
    title: "만들기 방",
    desc: "손으로 직접 만들어 봐요",
    Icon: Hammer,
  },
  {
    title: "무대",
    desc: "빛과 소리로 장면을 연습해요",
    Icon: Mic2,
  },
  {
    title: "꾸미기 방",
    desc: "깃발·소품을 꾸며 봐요",
    Icon: Palette,
  },
] as const;

export default function EveningPage() {
  const router = useRouter();
  const pairCode = useSessionStore((s) => s.pairCode);
  const riasecScores = useSessionStore((s) => s.riasecScores);

  useEffect(() => {
    if (!pairCode || !riasecScores) router.replace("/explore");
  }, [pairCode, riasecScores, router]);

  if (!pairCode || !riasecScores) return null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-sand font-sans">
      <TrailBar step={6} total={10} />

      <FullBleedScene asset={eveningBridgeAsset} heightClass="h-[58vh] min-h-[300px]" priority>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/50 via-white/15 to-transparent" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 pt-12">
          <span className="glass-card inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-ink">
            <Moon className="h-3 w-3 text-amber-500" />
            낮 탐험 완료
          </span>
          <span className="glass-card rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
            6/10
          </span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute inset-x-0 bottom-6 z-10 px-6 text-center"
        >
          <h2 className="text-[1.75rem] font-black leading-tight text-ink drop-shadow-sm">
            해가 지고, 캠프에 등불이 켜졌어
          </h2>
        </motion.div>
      </FullBleedScene>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 -mt-5 flex flex-1 flex-col rounded-t-[1.75rem] bg-sand px-6 pb-10 pt-7"
      >
        <div className="glass-card mb-5 rounded-2xl p-4 text-center">
          <p className="break-keep text-[15px] font-semibold leading-relaxed text-ink-soft">
            아까 고른 6번이 <span className="font-extrabold text-sky-600">너의 탐험 기록</span>
            이 됐어요.
            <br />
            이제 밤에 열리는 특별한 시간이 시작돼요.
          </p>
        </div>

        <p className="mb-4 text-center text-sm font-bold text-ink-muted">
          별빛 프로그램이란?
        </p>
        <p className="mb-6 break-keep text-center text-sm font-medium leading-relaxed text-ink-soft">
          {campTraditionIntro}
        </p>

        <div className="mb-6 flex justify-center gap-3">
          {EVENING_SPOTS.map(({ title, desc, Icon }) => (
            <div
              key={title}
              className="glass-card flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-2 py-3"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-extrabold text-ink">{title}</span>
              <span className="text-center text-[10px] font-medium leading-tight text-ink-muted">
                {desc}
              </span>
            </div>
          ))}
        </div>

        <div className="glass-card mb-6 flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-extrabold text-white">
            7
          </span>
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
          <p className="text-sm font-semibold leading-snug text-ink-soft">
            다음은 <span className="font-extrabold text-ink">별빛 프로그램</span>에서
            가고 싶은 곳과 도구를 고르는 시간이에요
          </p>
        </div>

        <p className="mb-8 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-amber-500" fill="currentColor" />
          낮 탐험을 이어서, 밤 탐험을 시작해 볼까요?
        </p>

        <div className="mt-auto">
          <CtaButton onClick={() => router.push("/explore/path")}>
            <Moon className="h-5 w-5" />
            별빛 프로그램 시작
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
