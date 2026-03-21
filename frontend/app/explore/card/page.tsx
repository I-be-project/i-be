"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { PersonaCard } from "@/components/card/PersonaCard";
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
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-white px-6 py-12 relative overflow-hidden font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, type: "spring", bounce: 0.4 }}
        className="w-full max-w-[500px] z-10 block flex-col items-center justify-center auto-cols-max"
      >
        <div className="text-center mb-10 mt-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="mb-3 inline-flex px-3 py-1 rounded-full bg-zinc-50 border border-solid border-zinc-300 text-zinc-700 text-sm font-bold tracking-widest"
          >
            발급 완료
          </motion.div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 tracking-tight">
            나만의 페르소나 카드
          </h1>
        </div>

        <div className="mb-12 w-full flex justify-center">
          <PersonaCard persona={persona} />
        </div>

        <div className="flex flex-col gap-4 w-full">
          <div className="flex gap-4">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-2 border-solid border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 text-zinc-700 shadow-none transition-all">
              <Download className="w-5 h-5 mr-2" />
              저장하기
            </Button>
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-2 border-solid border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 text-zinc-700 shadow-none transition-all">
              <Share2 className="w-5 h-5 mr-2" />
              공유하기
            </Button>
          </div>
          
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 border-transparent border-2 border-solid text-white shadow-none transition-all"
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
