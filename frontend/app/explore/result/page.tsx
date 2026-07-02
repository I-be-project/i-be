"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { Badge } from "@/components/ui/badge";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { CtaButton } from "@/components/voyage/CtaButton";
import { Sparkles, LayoutGrid, MapPin, IdCard } from "lucide-react";

const fadeInVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
} as const;

const staggerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
} as const;

export default function ResultPage() {
  const router = useRouter();
  const persona = useSessionStore((state) => state.persona);

  useEffect(() => {
    if (!persona) {
      router.replace("/explore");
    }
  }, [persona, router]);

  if (!persona) return null;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden pb-32 font-sans">
      <ExpeditionBackdrop mood="sunrise" />

      {/* 히어로 — 탐험의 끝, 페르소나 발견 */}
      <div className="relative z-10 flex flex-col items-center px-6 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: "spring" }}
          className="flex w-full max-w-md flex-col items-center"
        >
          <div className="glass-card mb-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink shadow-[0_4px_20px_rgba(14,58,79,0.15)]">
            <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
            나비섬 탐험 완료
          </div>
          <p className="mb-2 text-sm font-bold text-ink-muted">
            아침 해가 뜨고, 탐험이 찾아낸 너의 미래 페르소나
          </p>
          <h1 className="mb-3 break-keep text-4xl font-black leading-tight tracking-tight text-ink">
            {persona.name}
          </h1>
          <p className="max-w-xs break-keep text-base font-medium leading-relaxed text-ink-soft">
            “{persona.tagline}”
          </p>
        </motion.div>
      </div>

      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto mt-8 max-w-md space-y-6 px-6"
      >
        <div className="rounded-3xl border border-solid border-white/70 bg-white/85 p-6 shadow-[0_12px_32px_rgba(37,99,235,0.12)] backdrop-blur-xl">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-muted">
            핵심 키워드
          </h3>
          <div className="mb-8 flex flex-wrap gap-2">
            {persona.keywords.map((kw, i) => (
              <motion.div variants={fadeInVariants} key={i}>
                <Badge className="border-none bg-sky-100 px-4 py-1.5 text-sm font-bold text-sky-700">
                  #{kw}
                </Badge>
              </motion.div>
            ))}
          </div>

          <div className="space-y-7">
            <motion.div variants={fadeInVariants}>
              <div className="mb-3 flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-sky-600" />
                <h4 className="font-bold text-ink">관련 분야</h4>
              </div>
              <div className="flex flex-col space-y-2">
                {persona.fields.map((field) => (
                  <div
                    key={field}
                    className="flex items-center gap-3 rounded-xl border border-solid border-sky-100 bg-sky-50/80 p-3"
                  >
                    <div className="h-2 w-2 rounded-full bg-sky-400" />
                    <span className="text-sm font-bold text-ink-soft">{field}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeInVariants}>
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-amber-500" />
                <h4 className="font-bold text-ink">추천 체험 부스</h4>
              </div>
              <div className="flex flex-col space-y-2">
                {persona.recommendedBooths.map((booth) => (
                  <div
                    key={booth}
                    className="flex items-center gap-3 rounded-xl border border-solid border-amber-100 bg-amber-50/80 p-3"
                  >
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-sm font-bold text-ink-soft">{booth}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 flex justify-center bg-gradient-to-t from-sand via-sand/80 to-transparent p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <CtaButton
          onClick={() => router.push("/explore/card")}
          className="pointer-events-auto max-w-md"
        >
          <IdCard className="h-5 w-5" />
          내 탐험대원증 발급하기
        </CtaButton>
      </div>
    </main>
  );
}
