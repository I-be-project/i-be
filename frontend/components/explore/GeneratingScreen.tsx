"use client";

import { motion } from "framer-motion";
import { Compass, AlertCircle } from "lucide-react";
import { CtaButton } from "@/components/voyage/CtaButton";

interface GeneratingScreenProps {
  error: string | null;
  onRetry: () => void;
}

export function GeneratingScreen({ error, onRetry }: GeneratingScreenProps) {
  if (error) {
    return (
      <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
        <AlertCircle className="h-12 w-12 text-rose-400" />
        <p className="max-w-sm break-keep text-lg font-bold text-ink">{error}</p>
        <CtaButton onClick={onRetry} className="w-auto px-8">
          다시 시도
        </CtaButton>
      </div>
    );
  }

  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
      {/* 나침반이 도는 동안 다음 탐험길이 그려진다 */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
      >
        <Compass className="h-12 w-12 text-sky-500" />
      </motion.div>
      <p className="text-lg font-bold text-ink">
        너의 선택을 따라
        <br />
        다음 탐험길을 그리고 있어…
      </p>
    </div>
  );
}
