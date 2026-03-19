"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { mockPersonas } from "@/lib/mock/personas";

const floatingKeywords = [
  "호기심", "창의성", "논리", "자연", "미래",
  "연결", "안정", "도전", "데이터", "감성"
];

export default function InterpretingPage() {
  const router = useRouter();
  const setPersona = useSessionStore((state) => state.setPersona);
  const [currentKeyword, setCurrentKeyword] = useState<string>("");

  useEffect(() => {
    // Determine persona based on mock data (for prototype, pick randomly or based on answers)
    const randomPersona = mockPersonas[Math.floor(Math.random() * mockPersonas.length)];
    setPersona(randomPersona);

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
  }, [router, setPersona]);

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-950 px-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/20 via-zinc-950 to-purple-950/20 animate-pulse" />

      <div className="z-10 flex flex-col items-center max-w-sm text-center">
        <div className="relative w-32 h-32 mb-12 flex items-center justify-center">
          {/* Animated rings */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 border border-indigo-500/30 rounded-full"
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
            className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.5)] flex items-center justify-center text-white"
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </motion.div>
        </div>

        <motion.h2
          className="text-2xl font-bold text-zinc-100 mb-6 drop-shadow-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          네가 좋아하는 방향을<br />읽고 있어요...
        </motion.h2>

        <div className="h-12 flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            {currentKeyword && (
              <motion.div
                key={currentKeyword}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.5, y: -20 }}
                transition={{ duration: 0.5 }}
                className="px-6 py-2 bg-white/10 backdrop-blur-md rounded-full text-indigo-300 font-semibold tracking-wide border border-white/5"
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
