"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

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

  const renderQuestionUI = () => (
    <Textarea
      value={currentAnswer}
      onChange={(e) => setCurrentAnswer(e.target.value)}
      placeholder="자유롭게 입력해주세요..."
      className="min-h-[150px] text-lg p-4 bg-zinc-50 border-2 border-solid border-zinc-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus-visible:ring-indigo-500 shadow-sm"
    />
  );

  const isNextDisabled = currentAnswer.trim().length === 0;

  return (
    <main className="min-h-[100dvh] flex flex-col bg-white overflow-x-hidden font-sans">
      <div className="w-full max-w-2xl mx-auto px-6 py-8 flex-grow flex flex-col pt-12">
        <div className="mb-10">
          <Progress value={progress} className="h-2 mb-3 bg-zinc-100 border border-solid border-zinc-300 [&>div]:bg-indigo-500 rounded-full overflow-hidden" />
          <div className="text-zinc-500 font-bold text-sm flex justify-between tracking-widest uppercase">
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
            className="flex flex-col flex-grow"
          >
            <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 mb-10 leading-tight">
              {currentQuestion.text}
            </h2>

            <div className="flex-grow pb-32">
              {renderQuestionUI()}
            </div>
            
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent z-10 flex justify-center pb-8 border-t border-solid border-white">
              <Button
                size="lg"
                onClick={handleNext}
                disabled={isNextDisabled}
                className="w-full max-w-2xl h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold shadow-none border border-transparent transition-all"
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
