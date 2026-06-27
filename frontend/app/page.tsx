"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  const router = useRouter();

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

        <div className="w-full space-y-4">
          <Button
            size="lg"
            className="w-full h-14 text-base font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-none transition-all hover:scale-[1.02] active:scale-[0.98] border border-transparent"
            onClick={() => router.push("/signup")}
          >
            내 페르소나 찾기 시작
          </Button>

          <p className="text-center text-sm text-zinc-500 font-medium">
            이미 등록했다면{" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              로그인
            </button>
          </p>
        </div>
      </motion.div>
    </main>
  );
}
