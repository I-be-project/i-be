"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { ExpeditionBackdrop, type SceneId } from "@/components/voyage/ExpeditionScene";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { FullBleedScene } from "@/components/voyage/FullBleedScene";
import { ChoiceRow } from "@/components/explore/ChoiceRow";
import { computeScores, derivePairCode } from "@/lib/scoring";
import { saveAnswer } from "@/lib/api";
import { sceneAssets } from "@/lib/assets/sceneManifest";
import { useFlowGuard } from "@/lib/explore/flow";

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

export default function QuestionsPage() {
  const router = useRouter();
  const { ready } = useFlowGuard("questions");
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const upsertAnswer = useSessionStore((state) => state.upsertAnswer);
  const setRiasec = useSessionStore((state) => state.setRiasec);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");

  const currentQuestion = questions[currentIndex];

  // 복원 완료 시 저장된 답변 개수로 "마지막으로 답한 다음 질문"에서 이어서 시작한다.
  const initedRef = useRef(false);
  useEffect(() => {
    if (!hasHydrated || initedRef.current) return;
    initedRef.current = true;
    const stored = useSessionStore.getState().answers;
    if (stored.length > 0) {
      // 외부 스토어(localStorage 복원) → 로컬 상태 시딩. 복원이 끝난 뒤 한 번만 반영한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentIndex(Math.min(stored.length, questions.length - 1));
    }
  }, [hasHydrated, questions.length]);

  // 현재 질문에 이미 답이 있으면(뒤로 왔거나 이어하기) 그 선택을 불러온다.
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const existing = useSessionStore
      .getState()
      .answers.find((a) => a.questionId === q.id);
    // 현재 질문의 저장된 선택을 로컬 편집 상태로 시딩(뒤로/이어하기 시 유지).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentAnswer(typeof existing?.value === "string" ? existing.value : "");
  }, [currentIndex, questions]);

  // 다음 장면으로 넘어가면 맨 위(장면 창)부터 다시 보이게
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentIndex]);

  // Q1~6은 앞뒤로 오갈 수 있다. 뒤로 갈 때도 지금 선택을 저장해 두면 다시 왔을 때 유지된다.
  const handleBack = () => {
    if (currentIndex === 0) return;
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }
    setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = async () => {
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 뒤로 갔다 오며 답을 바꿨을 수 있으니 저장된 최종 답변을 다시 읽어 점수를 낸다.
      const nextAnswers = useSessionStore.getState().answers;
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 밤 브릿지로 이동
      const optionIds = nextAnswers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string");
      const scores = computeScores(optionIds);
      const pairCode = derivePairCode(scores);

      // Q1~6 결과를 한 번에 저장(= in_progress 세션 생성). 이후 Q7~9 저장이 이 세션을 재사용한다.
      // pairCode를 스토어에 반영하면 흐름 가드가 evening으로 넘기므로, 세션 id를 먼저 확보한다.
      const { studentToken, sessionId, setSessionId } = useSessionStore.getState();
      if (studentToken) {
        try {
          const res = await saveAnswer(studentToken, {
            sessionId: sessionId ?? undefined,
            stage: "q1to6",
            answer: { answers: nextAnswers, optionIds, riasec: scores, pairCode },
          });
          if (!sessionId) setSessionId(res.session_id);
        } catch (e) {
          console.error("Q1~6 결과 저장 실패", e);
        }
      }

      // 세션 저장 뒤 RIASEC/PairCode 확정 → 가드가 evening으로 이어준다(직접 push도 함께).
      setRiasec(scores, pairCode);
      router.push("/explore/evening");
    }
  };

  const isNextDisabled = currentAnswer.trim().length === 0;
  const isLast = currentIndex === questions.length - 1;
  // 장면 무드는 질문 id(1~6) 기준. 범위를 벗어나면 마지막 장면 유지.
  const sceneId = Math.min(6, Math.max(1, currentQuestion.id)) as SceneId;
  const sceneAsset = sceneAssets[sceneId];

  const choiceOptions =
    currentQuestion.options?.map((o) => ({
      id: o.id,
      label: o.label,
      riasec: o.primary,
    })) ?? [];

  // 복원 전이거나 진행상황에 맞지 않는 진입이면 가드가 리다이렉트할 때까지 그리지 않는다.
  if (!ready) return null;

  return (
    <main className="relative min-h-[100dvh] bg-sand font-sans">
      <ExpeditionBackdrop mood={sceneId} />
      <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />

      {/* Q1~6은 앞뒤 이동 가능 — 첫 질문이 아닐 때만 뒤로 버튼 노출 */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="이전 질문"
          className="fixed left-4 top-[max(1.5rem,env(safe-area-inset-top))] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink shadow-[0_2px_10px_rgba(14,58,79,0.15)] backdrop-blur transition-colors hover:bg-white/90 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="relative z-10 mx-auto w-full max-w-2xl"
        >
          {/* 풀스크린 장면 — welcome 톤 */}
          <FullBleedScene asset={sceneAsset} heightClass="h-[56vh] min-h-[300px]" priority>
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 pt-8">
              <span className="glass-card rounded-full px-3 py-1.5 text-[11px] font-bold text-ink">
                장면 {currentIndex + 1} · {currentQuestion.scene}
              </span>
              <span className="glass-card rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
                {currentIndex + 1}/{JOURNEY_TOTAL}
              </span>
            </div>
          </FullBleedScene>

          {/* 스크롤 영역 — 상황·질문·선택 */}
          <div className="relative -mt-5 rounded-t-[1.75rem] bg-sand px-6 pb-36 pt-6">
            {currentQuestion.story && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card mb-5 rounded-2xl p-4"
              >
                <p className="break-keep text-[15px] font-semibold leading-relaxed text-ink-soft">
                  {currentQuestion.story}
                </p>
              </motion.div>
            )}

            <h2 className="mb-6 break-keep text-2xl font-extrabold leading-snug text-ink">
              {currentQuestion.text}
            </h2>

            <ChoiceRow
              options={choiceOptions}
              selectedId={currentAnswer || null}
              onSelect={setCurrentAnswer}
            />
          </div>

          <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-2xl -translate-x-1/2 justify-center bg-gradient-to-t from-sand via-sand/90 to-transparent p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            <CtaButton
              onClick={handleNext}
              disabled={isNextDisabled}
              className="max-w-2xl"
            >
              {isLast ? "캠프로 돌아가기" : "다음 장면으로"}
            </CtaButton>
          </div>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
