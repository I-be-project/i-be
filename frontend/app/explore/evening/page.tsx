"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Moon, Sparkles } from "lucide-react";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { eveningBridgeAsset } from "@/lib/assets/sceneManifest";
import { useFlowGuard, useBlockBack } from "@/lib/explore/flow";

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
        heightClass="h-[40vh] min-h-[260px]"
        priority
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-black/35 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-[calc(env(safe-area-inset-top)+2rem)]">
          <span className="glass-card inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-ink">
            <Moon className="h-3.5 w-3.5 text-amber-500" fill="currentColor" />
            낮 탐험 · 완료
          </span>
          <span className="glass-card rounded-full px-3 py-1.5 text-[13px] font-bold text-ink">
            6/10
          </span>
        </div>
      </FullBleedScene>

      <motion.div
        initial={{ y: "45%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[calc(100dvh-3rem)] flex-col px-6 pt-14"
        style={{
          background:
            "linear-gradient(to bottom, rgba(253,243,224,0) 0px, rgba(253,243,224,0.6) 52px, #fdf3e0 104px, #fffbf3 100%)",
        }}
      >
        <h2 className="mb-2 break-keep text-center text-[1.85rem] font-black leading-[1.3] tracking-tight text-ink drop-shadow-[0_1px_10px_rgba(255,255,255,0.6)]">
          해가 지고, 캠프에 등불이 켜졌어
        </h2>
        <p className="mb-5 break-keep text-center text-[15px] font-bold leading-relaxed text-ink-soft drop-shadow-[0_1px_8px_rgba(255,255,255,0.6)]">
          탐험대와 함께한 낮 여섯 장면, 모두 끝냈어.
        </p>

        <div className="glass-card mb-4 min-h-0 flex-1 overflow-y-auto rounded-3xl p-5 text-left">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-700">
            <Sparkles className="h-3.5 w-3.5" fill="currentColor" />
            별빛 프로그램
          </div>
          <p className="mb-4 break-keep text-[14px] leading-relaxed text-ink-soft">
            낮에는 팀과 함께 섬을 돌았어. 코스를 따라가며 갈림길마다 누구와
            어떻게 움직일지 — 네 행동을 하나씩 골랐지. 여섯 번의 선택이 탐험
            일지에 차곡차곡 남아 있어.
          </p>
          <p className="mb-4 break-keep text-[14px] leading-relaxed text-ink-soft">
            밤이 되면 이야기가 달라져. 등불이 켜진 캠프 안으로 들어가, 이번엔
            네가 먼저 들어가 보고 싶은 공간부터 고르게 될 거야. 팀 상황보다 네
            관심에 가까운 선택 — 어디에 발을 디딜지, 어떤 도구와 방식으로 써
            볼지, 마지막에는 탐험대원증에 새길 이름까지 이어져.
          </p>
          <p className="break-keep text-[14px] leading-relaxed text-ink-soft">
            앞여섯 장면과 다른 느낌이지만, 하는 일은 같아. 정답 없이, 지금
            끌리는 쪽을 골라주면 돼.
          </p>
        </div>

        <div className="mb-5 shrink-0 rounded-2xl bg-amber-50 px-5 py-4 text-left ring-1 ring-amber-200/60">
          <p className="break-keep text-[15px] font-bold leading-relaxed text-ink">
            네 번만 더하면 오늘 탐험이 끝나. 약 10분이면 마무리할 수 있어.
          </p>
        </div>

        <p className="mb-2 inline-flex shrink-0 items-center justify-center gap-1.5 text-center text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-amber-500" fill="currentColor" />
          별빛 아래, 첫 공간으로 들어갈까?
        </p>

        <div className="shrink-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <CtaButton onClick={() => router.push("/explore/path")}>
            <Moon className="h-5 w-5" />
            별빛 프로그램 시작
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
