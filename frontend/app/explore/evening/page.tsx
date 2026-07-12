"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { DragSheet } from "@/components/voyage/DragSheet";
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
        heightClass="h-[68vh] min-h-[360px]"
        priority
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/50 via-white/15 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute inset-x-0 top-0 z-10 flex max-w-[80%] flex-col px-6 pt-12 text-left"
        >
          <h2 className="text-[2.85rem] font-black leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            캠프의 밤
          </h2>
          <p className="mt-2 text-[15px] font-semibold leading-relaxed text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
            해가 지고, 캠프에 등불이 켜졌어
          </p>
        </motion.div>
      </FullBleedScene>

      <DragSheet>
        <div className="glass-card mb-4 rounded-3xl p-5 text-left">
          <p className="break-keep text-[17px] font-extrabold leading-loose text-ink">
            낮에는 팀원들과 모험을 하면서 코스를 정하고, 네 행동을 골랐었지.
          </p>

          <div className="my-5 h-px bg-ink/10" />

          <p className="break-keep text-[15px] font-medium leading-loose text-ink-muted">
            밤이 되면 등불이 켜진 캠프 안으로 들어가, <br />
            이번엔 네가 먼저 들어가 보고 싶은 공간부터 고르게 될 거야.
          </p>

          <p className="mt-4 break-keep text-[15px] font-medium leading-loose text-ink-muted">
            팀 상황보다 네 관심에 가까운 선택 - 어디에 발을 디딜지, 어떤 도구와
            방식으로 써 볼지, 마지막에는 탐험대원증에 새길 이름까지 이어져.
          </p>

          <p className="mt-5 break-keep text-[15px] font-medium leading-loose text-ink-muted">
            앞 여섯 장면과 다른 느낌이지만, 하는 일은 같아.
            <br />
            정답 없이, 지금 끌리는 쪽을 골라주면 돼.
          </p>
        </div>

        <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <CtaButton onClick={() => router.push("/explore/path")}>
            별빛 프로그램 시작
          </CtaButton>
        </div>
      </DragSheet>
    </main>
  );
}
