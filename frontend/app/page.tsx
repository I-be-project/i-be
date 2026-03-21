"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function WelcomePage() {
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();

  const handleStart = () => {
    if (agreed) {
      router.push("/explore");
    }
  };

  return (
    <main className="relative flex flex-col items-center justify-center min-h-[100dvh] bg-white px-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex flex-col items-center w-full max-w-md p-8 bg-white border-2 border-solid border-zinc-300 rounded-3xl shadow-sm"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
          className="mb-6 px-4 py-1.5 rounded-full bg-zinc-100 text-zinc-700 text-sm font-bold tracking-wide border border-solid border-zinc-300"
        >
          2026 나Be한마당
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-center text-zinc-900 tracking-tight leading-snug mb-4">
          너는 어떤 <span className="text-indigo-600">미래</span>를<br />살아보고 싶니?
        </h1>
        
        <p className="text-zinc-500 text-center text-sm md:text-base mb-10 leading-relaxed font-medium">
          너의 취향과 관심사를 통해<br />숨겨진 페르소나 카드를 발견해보자!
        </p>

        <div className="w-full space-y-6">
          <div className="flex items-start space-x-3 p-4 bg-zinc-50 rounded-xl flex items-center border border-solid border-zinc-300">
            <Checkbox
              id="privacy"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
              className="mt-0.5 border-zinc-400"
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="privacy"
                className="text-sm font-bold leading-none text-zinc-700 cursor-pointer"
              >
                개인정보 수집 및 이용 동의
              </label>
              <p className="text-xs text-zinc-500">
                행사 기록 및 페르소나 분석을 위해 최소한의 정보를 수집합니다.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-base font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-none transition-all hover:scale-[1.02] active:scale-[0.98] border border-transparent"
            disabled={!agreed}
            onClick={handleStart}
          >
            내 페르소나 찾기 시작
          </Button>
        </div>
      </motion.div>
    </main>
  );
}

