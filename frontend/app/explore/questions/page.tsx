"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { Textarea } from "@/components/ui/textarea";
import {
  ExpeditionBackdrop,
  SceneWindow,
  type SceneId,
} from "@/components/voyage/ExpeditionScene";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { cn } from "@/lib/utils";
import { computeScores, derivePairCode } from "@/lib/scoring";
import { saveAnswer } from "@/lib/api";

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

// 선택지 순차 등장 — 스토리북처럼 하나씩 나타난다.
const optionListVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const optionItemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 생성형 단계로 이동
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

      router.push("/explore/path");
    }
  };

  const renderQuestionUI = () => {
    if (currentQuestion.type === "choice" && currentQuestion.options) {
      return (
        <motion.div
          variants={optionListVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3"
        >
          {currentQuestion.options.map((option) => {
            const selected = currentAnswer === option.id;
            return (
              <motion.button
                key={option.id}
                variants={optionItemVariants}
                type="button"
                onClick={() => setCurrentAnswer(option.id)}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-2xl border border-solid p-4 text-left text-[15px] font-medium backdrop-blur-xl transition-colors",
                  selected
                    ? "border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)]"
                    : "border-white/70 bg-white/80 text-ink shadow-[0_8px_24px_rgba(37,99,235,0.08)] hover:border-sky-300 active:scale-[0.99]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-solid transition-colors",
                    selected
                      ? "border-white bg-white/30"
                      : "border-sky-300 bg-white/60",
                  )}
                  aria-hidden
                >
                  {selected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  )}
                </span>
                <span className="break-keep leading-relaxed">{option.label}</span>
              </motion.button>
            );
          })}
        </motion.div>
      );
    }

    return (
      <Textarea
        value={currentAnswer}
        onChange={(e) => setCurrentAnswer(e.target.value)}
        placeholder="자유롭게 입력해주세요..."
        className="min-h-[150px] rounded-2xl border border-solid border-white/70 bg-white/80 p-4 text-base shadow-[0_8px_24px_rgba(37,99,235,0.08)] backdrop-blur-xl focus-visible:ring-sky-500"
      />
    );
  };

  const isNextDisabled = currentAnswer.trim().length === 0;
  const isLast = currentIndex === questions.length - 1;
  // 장면 무드는 질문 id(1~6) 기준. 범위를 벗어나면 마지막 장면 유지.
  const sceneId = Math.min(6, Math.max(1, currentQuestion.id)) as SceneId;

  return (
    // overflow-hidden은 배경 컴포넌트가 자체 처리 — main에 걸면 sticky CTA가 죽는다
    <main className="relative flex min-h-[100dvh] flex-col font-sans">
      <ExpeditionBackdrop mood={sceneId} />
      <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-grow flex-col px-6 pb-8 pt-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex flex-grow flex-col"
          >
            <SceneWindow
              scene={sceneId}
              label={currentQuestion.scene}
              step={currentIndex + 1}
              total={JOURNEY_TOTAL}
            />

            {/* 상황(내레이션) + 질문 — 위계를 나눠 읽기 쉽게 */}
            {currentQuestion.story && (
              <p className="mb-2 break-keep text-[15px] font-semibold leading-relaxed text-ink-muted">
                {currentQuestion.story}
              </p>
            )}
            <h2 className="mb-7 break-keep text-2xl font-extrabold leading-snug text-ink">
              {currentQuestion.text}
            </h2>

            <div className="flex-grow pb-32">{renderQuestionUI()}</div>

            <div className="sticky bottom-0 z-10 -mx-6 flex justify-center bg-gradient-to-t from-sand via-sand/80 to-transparent p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
              <CtaButton
                onClick={handleNext}
                disabled={isNextDisabled}
                className="max-w-md"
              >
                {isLast ? "다음 탐험으로" : "다음 장면으로"}
              </CtaButton>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
