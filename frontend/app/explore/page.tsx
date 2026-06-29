"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function ExplorePage() {
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-white font-sans">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="inline-block mb-3 px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-bold tracking-wider border border-solid border-zinc-300">
          STEP 01
        </div>
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-indigo-50 border border-solid border-indigo-200 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-indigo-500" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 mb-3">
          여섯 가지 질문에 답해볼까요?
        </h1>
        <p className="text-zinc-500 font-medium leading-relaxed">
          정답은 없어요. 떠오르는 대로 자유롭게 적으면<br />
          너에게 어울리는 진로 페르소나를 찾아줄게요.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-md px-4"
      >
        <Button
          size="lg"
          onClick={() => router.push("/explore/questions")}
          className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold shadow-none border border-transparent transition-all"
        >
          설문 시작하기
        </Button>
      </motion.div>
    </main>
  );
}
