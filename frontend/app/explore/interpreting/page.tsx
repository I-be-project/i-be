"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Compass } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";

const floatingKeywords = [
  "호기심", "창의성", "논리", "자연", "미래",
  "연결", "안정", "도전", "데이터", "감성"
];

export default function InterpretingPage() {
  const router = useRouter();
  // 실제 페르소나는 Q10 확정 단계(explore/path)에서 이미 스토어에 저장돼 있다.
  // 여기서는 덮어쓰지 않고, 없으면 처음으로 돌려보낸다.
  const persona = useSessionStore((state) => state.persona);
  const [currentKeyword, setCurrentKeyword] = useState<string>("");

  useEffect(() => {
    if (!persona) {
      router.replace("/explore");
      return;
    }

    // Floating keywords animation loop
    let idx = 0;
    const interval = setInterval(() => {
      setCurrentKeyword(floatingKeywords[idx]);
      idx = (idx + 1) % floatingKeywords.length;
    }, 600);

    // Navigate to result after 3.5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      router.push("/explore/result");
    }, 3500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [router, persona]);

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 font-sans">
      <VoyageBackground />

      <div className="relative z-10 flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-12 flex h-32 w-32 items-center justify-center">
          {/* 퍼져나가는 물결 링 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-solid border-sky-300/70"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{
                scale: 2,
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.6,
                ease: "easeOut",
              }}
            />
          ))}

          <motion.div
            className="glass-card flex h-16 w-16 items-center justify-center rounded-full text-sky-500 shadow-[0_8px_24px_rgba(37,99,235,0.2)]"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            >
              <Compass className="h-8 w-8" />
            </motion.div>
          </motion.div>
        </div>

        <motion.h2
          className="mb-6 text-2xl font-extrabold leading-snug text-ink"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          나비섬에서의 탐험 기록을
          <br />
          읽고 있어…
        </motion.h2>

        <div className="flex h-12 items-center justify-center">
          <AnimatePresence mode="popLayout">
            {currentKeyword && (
              <motion.div
                key={currentKeyword}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.5, y: -20 }}
                transition={{ duration: 0.5 }}
                className="glass-card rounded-full px-6 py-2 font-bold tracking-wide text-ink-soft"
              >
                #{currentKeyword}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
