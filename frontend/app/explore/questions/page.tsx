"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";
import { cn } from "@/lib/utils";

export default function QuestionsPage() {
  const router = useRouter();
  const addAnswer = useSessionStore((state) => state.addAnswer);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");

  const currentQuestion = questions[currentIndex];
  // Calculate raw progress (e.g. 0 to 1) then convert to percentage.
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleNext = () => {
    if (currentAnswer.trim().length > 0) {
      addAnswer({
        questionId: currentQuestion.id,
        // 선택형은 선택지 고유 ID, 자유형은 입력 텍스트를 저장한다.
        value: currentAnswer,
      });
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer(""); // reset for next
    } else {
      router.push("/explore/interpreting");
    }
  };

  const renderQuestionUI = () => {
    if (currentQuestion.type === "choice" && currentQuestion.options) {
      return (
        <div className="flex flex-col gap-3">
          {currentQuestion.options.map((option) => {
            const selected = currentAnswer === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setCurrentAnswer(option.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border border-solid p-4 text-left text-base font-medium backdrop-blur-xl transition-all",
                  selected
                    ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_12px_28px_rgba(124,77,229,0.35)]"
                    : "border-white/70 bg-white/80 text-[#2a2550] shadow-[0_10px_30px_rgba(123,97,240,0.1)] hover:scale-[1.01] hover:border-indigo-300",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-solid transition-colors",
                    selected
                      ? "border-white bg-white/30"
                      : "border-indigo-300 bg-white/60",
                  )}
                  aria-hidden
                >
                  {selected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  )}
                </span>
                <span className="leading-snug">{option.label}</span>
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <Textarea
        value={currentAnswer}
        onChange={(e) => setCurrentAnswer(e.target.value)}
        placeholder="자유롭게 입력해주세요..."
        className="min-h-[150px] rounded-xl border border-solid border-white/70 bg-white/80 p-4 text-lg shadow-[0_10px_30px_rgba(123,97,240,0.1)] backdrop-blur-xl focus:ring-2 focus:ring-indigo-500 focus-visible:ring-indigo-500"
      />
    );
  };

  const isNextDisabled = currentAnswer.trim().length === 0;

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      <CelestialBackground variant="soft" />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-grow flex-col px-6 py-8 pt-12">
        <div className="mb-10">
          <Progress
            value={progress}
            className="mb-3 h-2 overflow-hidden rounded-full border border-solid border-white/70 bg-white/50 [&>div]:bg-gradient-to-r [&>div]:from-indigo-500 [&>div]:to-purple-500"
          />
          <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-[#5b5685]">
            <span>질문 탐색</span>
            <span>{currentIndex + 1} / {questions.length}</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex flex-grow flex-col"
          >
            <h2 className="mb-10 text-2xl font-extrabold leading-tight text-[#2a2550] md:text-3xl">
              {currentQuestion.text}
            </h2>

            <div className="flex-grow pb-32">
              {renderQuestionUI()}
            </div>

            <div className="sticky bottom-0 z-10 -mx-6 flex justify-center bg-gradient-to-t from-[#fdefe3] via-[#fdefe3]/80 to-transparent p-6 pb-8">
              <Button
                size="lg"
                onClick={handleNext}
                disabled={isNextDisabled}
                className="h-14 w-full max-w-2xl rounded-2xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-bold text-white shadow-[0_10px_24px_rgba(124,77,229,0.3)] transition-all hover:scale-[1.01] hover:shadow-[0_14px_30px_rgba(124,77,229,0.4)] active:scale-[0.99]"
              >
                {currentIndex === questions.length - 1 ? "결과 확인하기" : "다음 질문"}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
