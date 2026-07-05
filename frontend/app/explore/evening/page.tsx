"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Moon, Sparkles, Hammer, Mic2, Palette, ArrowRight } from "lucide-react";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { eveningBridgeAsset } from "@/lib/assets/sceneManifest";
import { campTraditionIntro } from "@/lib/mock/campMap";
import { useFlowGuard, useBlockBack } from "@/lib/explore/flow";

const EVENING_SPOTS = [
  {
    title: "만들기 방",
    desc: "손끝으로 무언가를 빚어 내는 밤",
    Icon: Hammer,
  },
  {
    title: "무대",
    desc: "빛과 소리로 장면을 그려 보는 밤",
    Icon: Mic2,
  },
  {
    title: "꾸미기 방",
    desc: "깃발과 소품으로 분위기를 입히는 밤",
    Icon: Palette,
  },
] as const;

export default function EveningPage() {
  const router = useRouter();
  // evening은 Q6 완료 후 밤(Q7) 직전 브릿지 — 여기부터는 뒤로가기를 막는다.
  const { ready } = useFlowGuard("evening");
  useBlockBack();

  if (!ready) return <FlowLoading mood="night" />;

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-sand font-sans">
      <TrailBar step={6} total={10} />

      <FullBleedScene
        asset={eveningBridgeAsset}
        heightClass="h-[58vh] min-h-[300px]"
        priority
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/50 via-white/15 to-transparent" />
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-4 px-6 pt-12">
          <div className="flex items-start justify-end">
            <span className="glass-card rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
              6/10
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-[80%] text-left"
          >
            <h2 className="text-[2.4rem] font-black leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              캠프의 밤
            </h2>
            <p className="mt-2 text-[15px] font-semibold leading-relaxed text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
              해가 지고, 캠프에 등불이 켜졌어
            </p>
          </motion.div>
        </div>
      </FullBleedScene>

      <motion.div
        initial={{ y: "45%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[calc(100dvh-4.5rem)] flex-col rounded-t-[1.75rem] bg-sand px-6 pt-7 shadow-[0_-12px_32px_rgba(14,58,79,0.14)]"
      >
        <div className="glass-card mb-5 rounded-2xl p-4 text-center">
          <p className="break-keep text-[15px] font-semibold leading-relaxed text-ink-soft">
            오늘 고른 6번이 <span className="font-extrabold text-sky-600">탐험 일지</span>
            에 새겨졌어.
            <br />
            이제 별빛 프로그램 — 캠프만의 밤이 시작돼.
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
            다음 장면에서는{" "}
            <span className="font-extrabold text-ink">별빛 아래 열린 공간</span>과,
            그곳의 도구를 고르게 될 거야.
          </p>
        </div>

        <p className="mb-2 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-amber-500" fill="currentColor" />
          낮의 기록을 이어, 밤 탐험을 시작해 볼까?
        </p>

        <div className="mt-auto shrink-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <CtaButton onClick={() => router.push("/explore/path")}>
            <Moon className="h-5 w-5" />
            별빛 프로그램 시작
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
