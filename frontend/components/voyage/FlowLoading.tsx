"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Compass } from "lucide-react";
import { ExpeditionBackdrop, type VoyageMood } from "./ExpeditionScene";

// 탐험 흐름 로딩 화면 — 복원(hydrate) 대기·라우팅 판단 중에 보여준다.
// 가드가 걸린 화면들이 `null` 대신 이걸 그려, AppFrame의 빈 하늘색 프레임이
// 맨몸으로 노출돼 "하늘 배경에 갇힌 것처럼" 보이는 걸 막는다.
export function FlowLoading({
  mood = "morning",
  label = "탐험 일지를 불러오는 중…",
}: {
  mood?: VoyageMood;
  label?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden font-sans">
      <ExpeditionBackdrop mood={mood} />

      <div className="relative z-10 flex flex-col items-center gap-5 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* 퍼져나가는 물결 링 */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-solid border-sky-300/50"
              animate={reduce ? undefined : { scale: [0.85, 1.9], opacity: [0.6, 0] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.55,
                ease: "easeOut",
              }}
            />
          ))}
          {/* 천천히 도는 나침반 */}
          <motion.div
            className="glass-card flex h-14 w-14 items-center justify-center rounded-full text-sky-500"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          >
            <Compass className="h-7 w-7" />
          </motion.div>
        </div>

        <span className="glass-card rounded-full px-4 py-1.5 text-sm font-bold text-ink">
          {label}
        </span>
      </div>
    </main>
  );
}
