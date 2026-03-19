"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { PersonaCard, CardFront, CardBack } from "@/components/card/PersonaCard";
import { Button } from "@/components/ui/button";
import { Download, Share2, UserSquare2 } from "lucide-react";

export default function CardPage() {
  const router = useRouter();
  const persona = useSessionStore((state) => state.persona);

  useEffect(() => {
    if (!persona) {
      router.replace("/explore");
    }
  }, [persona, router]);

  if (!persona) return null;

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-6 py-12 relative overflow-hidden">
      {/* Dynamic Background patterns */}
      <div className="absolute inset-0 pattern-dots pattern-zinc-300 dark:pattern-zinc-800 pattern-bg-transparent pattern-size-4 pattern-opacity-40" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-zinc-200 dark:from-zinc-900 to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, type: "spring", bounce: 0.4 }}
        className="w-full max-w-sm z-10"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="mb-3 inline-flex px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-sm font-bold tracking-widest shadow-sm"
          >
            발급 완료
          </motion.div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            나만의 페르소나 카드
          </h1>
        </div>

        <div className="mb-12">
          <PersonaCard persona={persona} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:shadow-md">
              <Download className="w-5 h-5 mr-2" />
              저장하기
            </Button>
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:shadow-md">
              <Share2 className="w-5 h-5 mr-2" />
              공유하기
            </Button>
          </div>
          
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_8px_30px_rgba(99,102,241,0.25)] transition-all hover:-translate-y-1"
            onClick={() => router.push("/profile/me")}
          >
            <UserSquare2 className="w-5 h-5 mr-2" />
            내 프로필로 이동
          </Button>
        </div>
      </motion.div>
    </main>
  );
}
