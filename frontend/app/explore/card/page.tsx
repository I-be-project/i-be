"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { PersonaCard } from "@/components/card/PersonaCard";
import { Button } from "@/components/ui/button";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { CtaButton } from "@/components/voyage/CtaButton";
import { Download, Share2, Sparkles, UserSquare2 } from "lucide-react";

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
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-12 font-sans">
      <ExpeditionBackdrop mood="sunrise" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, type: "spring", bounce: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="glass-card mb-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink shadow-[0_4px_20px_rgba(14,58,79,0.15)]"
          >
            <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
            발급 완료
          </motion.div>
          <h1 className="text-[1.75rem] font-black tracking-tight text-ink">
            나의 탐험대원증
          </h1>
          <p className="mt-2 text-sm font-medium text-ink-muted">
            나비섬 탐험이 만들어 낸 너의 페르소나야.
          </p>
        </div>

        <div className="mb-10 flex w-full justify-center">
          <PersonaCard persona={persona} />
        </div>

        <div className="flex w-full flex-col gap-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="glass-card h-14 flex-1 rounded-full border-white/70 text-ink shadow-none transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              <Download className="mr-2 h-5 w-5 text-sky-600" />
              저장하기
            </Button>
            <Button
              variant="outline"
              className="glass-card h-14 flex-1 rounded-full border-white/70 text-ink shadow-none transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              <Share2 className="mr-2 h-5 w-5 text-sky-600" />
              공유하기
            </Button>
          </div>

          <CtaButton onClick={() => router.push("/profile/me")}>
            <UserSquare2 className="h-5 w-5" />
            내 탐험 기록 보기
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
