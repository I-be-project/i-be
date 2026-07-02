"use client";

import { motion } from "framer-motion";

// 화면 최상단에 붙는 얇은 여정 진행선 — 진행 헤더 블록 없이 진행도를 보여준다.
export function TrailBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label="탐험 진행도"
      className="absolute inset-x-0 top-0 z-20 h-1.5 bg-white/40"
    >
      <motion.div
        className="h-full rounded-r-full bg-gradient-to-r from-sky-400 to-blue-500"
        initial={false}
        animate={{ width: `${(step / total) * 100}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
