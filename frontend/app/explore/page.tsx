"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Compass, ScrollText, Sparkles } from "lucide-react";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { useSessionStore } from "@/store/useSessionStore";
import { briefingCampMapAsset } from "@/lib/assets/sceneManifest";

// 탐험 브리핑 — 나로섬 도착 장면. Q1~6 스토리의 도입부를 여기서 연다.
export default function ExplorePage() {
  const router = useRouter();
  // 완료 저장은 인증이 필요하므로 설문 시작 전에 로그인 토큰이 있어야 한다.
  // hasHydrated 전에는 localStorage 복원 중이므로 판단을 보류(성급한 /login 튕김 방지).
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);
  useEffect(() => {
    if (hasHydrated && !studentToken) router.replace("/login");
  }, [hasHydrated, studentToken, router]);
  if (!hasHydrated || !studentToken) return <FlowLoading />;

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-sand font-sans">
      <FullBleedScene
        asset={briefingCampMapAsset}
        heightClass="h-[62vh] min-h-[320px]"
        priority
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/65 via-white/20 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="absolute inset-x-0 top-0 z-10 flex flex-col items-start px-6 pt-12 text-left"
        >
          <div className="glass-card mb-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-ink">
            <Compass className="h-4 w-4 text-sky-500" />
            탐험 브리핑 · 입항
          </div>
          <h1 className="max-w-[80%] text-[1.9rem] font-black leading-tight tracking-tight text-ink drop-shadow-sm">
            나로섬에 도착했어!
          </h1>
          <p className="mt-2 max-w-[80%] text-[15px] font-semibold leading-relaxed text-ink-soft">
            바닷바람 너머, 탐험 캠프가 보여.
          </p>
        </motion.div>
      </FullBleedScene>

      <motion.div
        initial={{ y: "45%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[calc(100dvh-4.5rem)] flex-col rounded-t-[1.75rem] bg-sand px-6 pt-7 shadow-[0_-12px_32px_rgba(14,58,79,0.14)]"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card mb-4 rounded-2xl p-5 text-left"
        >
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-sm font-bold text-sky-600">
            <ScrollText className="h-4 w-4" strokeWidth={2.2} />
            탐험 안내
          </div>
          <p className="text-[15px] font-extrabold leading-relaxed text-ink">
            하루 동안 장면을 지나며 선택하고, 그 선택들이 모여 너만의
            탐험대원증이 돼.
          </p>

          <div className="my-4 h-px bg-ink/10" />

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-[15px] font-extrabold text-ink">
                이건 뭐 하는 체험이야?
              </p>
              <p className="text-[15px] font-medium leading-relaxed text-ink-muted">
                나Be한마당에서 폰으로 하는 미래 탐험이야. 게임처럼 하루를
                살아가며 선택해. 정답을 맞히는 게 아니라, 네가 끌리는 쪽을
                골라보면 돼.
              </p>
            </div>
            <div>
              <p className="text-[15px] font-medium leading-relaxed text-ink-muted">
                끝나면 탐험대원증이 만들어져. 한마당 체험부스에서 네 탐험
                이야기를 이어갈, 너를 설명하는 카드야.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58 }}
          className="mb-6 rounded-2xl bg-amber-50 px-5 py-4 text-left ring-1 ring-amber-200/60"
        >
          <p className="text-[15px] font-bold leading-relaxed text-ink">
            탐험이 끝나면 탐험대원증이 완성돼. 한마당에서 공개되는 날, 네가 고른
            미래 이름이 펼쳐질 거야.
          </p>
        </motion.div>

        <p className="mb-2 inline-flex items-center justify-center gap-1.5 text-center text-sm font-bold text-ink-muted">
          <Sparkles className="h-4 w-4 text-sky-500" fill="currentColor" />
          준비됐다면, 낮 탐험 첫 장면으로!
        </p>

        <div className="mt-auto shrink-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <CtaButton onClick={() => router.push("/explore/questions")}>
            <Compass className="h-5 w-5" />낮 탐험 시작하기
          </CtaButton>
        </div>
      </motion.div>
    </main>
  );
}
