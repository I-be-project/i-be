"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

export default function QuestionsPage() {
  const router = useRouter();
  const addAnswer = useSessionStore((state) => state.addAnswer);
  const setRiasec = useSessionStore((state) => state.setRiasec);
  const answers = useSessionStore((state) => state.answers);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");

  const currentQuestion = questions[currentIndex];

  // 다음 장면으로 넘어가면 맨 위(장면 창)부터 다시 보이게
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentIndex]);

  const handleNext = async () => {
    let nextAnswers = answers;
    if (currentAnswer.trim().length > 0) {
      const answer = { questionId: currentQuestion.id, value: currentAnswer };
      addAnswer(answer);
      nextAnswers = [...answers, answer];
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer("");
    } else {
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 밤 브릿지로 이동
      const optionIds = nextAnswers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string");
      const scores = computeScores(optionIds);
      const pairCode = derivePairCode(scores);
      setRiasec(scores, pairCode);

      // Q1~6 결과를 한 번에 저장(= in_progress 세션 생성). 이후 Q7~9 저장이 이 세션을 재사용한다.
      // 세션 id를 확보한 뒤 이동하려고 await 하되, 실패해도 설문 진행은 막지 않는다.
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

  return (
    <main className="relative min-h-[100dvh] bg-sand font-sans">
      <ExpeditionBackdrop mood={sceneId} />
      <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />

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

          <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-center bg-gradient-to-t from-sand via-sand/90 to-transparent p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
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
