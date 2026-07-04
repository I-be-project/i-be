"use client";

import { motion } from "framer-motion";
import { Compass, AlertCircle } from "lucide-react";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import {
  generatingAssets,
  generatingCopy,
  type GeneratingStage,
} from "@/lib/assets/sceneManifest";

interface GeneratingScreenProps {
  error: string | null;
  onRetry: () => void;
  stage?: GeneratingStage;
}

/** Q7B–Q10 생성 대기 — welcome 톤 풀스크린 컷신 */
export function GeneratingScreen({ error, onRetry, stage = "q7b" }: GeneratingScreenProps) {
  const asset = generatingAssets[stage];
  const copy = generatingCopy[stage];

  if (error) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#49a7e0]/95 px-6 text-center">
        <div className="glass-card flex max-w-sm flex-col items-center gap-5 rounded-3xl p-8">
          <AlertCircle className="h-12 w-12 text-rose-400" />
          <p className="break-keep text-lg font-bold text-ink">{error}</p>
          <CtaButton onClick={onRetry} className="w-auto px-8">
            다시 시도
          </CtaButton>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 overflow-hidden">
      <FullBleedScene asset={asset} heightClass="h-[100dvh]" priority bottomScrim={false}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/60 via-white/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-[#fdf3e0]/95 via-[#fdf3e0]/55 to-transparent" />

        <div className="absolute inset-0 flex flex-col items-center justify-end px-7 pb-[max(3.5rem,env(safe-area-inset-bottom))] text-center">
          <motion.div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-[0_8px_24px_rgba(13,48,71,0.15)]"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "linear" }}
          >
            <Compass className="h-7 w-7 text-sky-500" />
          </motion.div>
          <motion.p
            key={copy.main}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 break-keep text-xl font-extrabold leading-snug text-[#0d3047]"
          >
            {copy.main}
          </motion.p>
          <motion.p
            key={copy.sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="break-keep text-[15px] font-semibold text-[#0d3047]/75"
          >
            {copy.sub}
          </motion.p>
        </div>
      </FullBleedScene>
    </div>
  );
}
