"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, Answer } from "@/store/useSessionStore";
import { mockQuestions, Question } from "@/lib/mock/questions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export default function QuestionsPage() {
  const router = useRouter();
  const inputMode = useSessionStore((state) => state.inputMode);
  const addAnswer = useSessionStore((state) => state.addAnswer);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string | string[]>([]);

  useEffect(() => {
    if (!inputMode) {
      router.replace("/explore");
      return;
    }
    setQuestions(mockQuestions[inputMode] || []);
  }, [inputMode, router]);

  if (!questions.length) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  // Calculate raw progress (e.g. 0 to 1) then convert to percentage.
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleNext = () => {
    if (currentAnswer.length > 0) {
      addAnswer({
        questionId: currentQuestion.id,
        value: currentAnswer,
      });
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer([]); // reset for next
    } else {
      router.push("/explore/interpreting");
    }
  };

  const handleToggleAnswer = (opt: string, isMulti: boolean = false) => {
    if (isMulti) {
      const arr = Array.isArray(currentAnswer) ? currentAnswer : [];
      if (arr.includes(opt)) {
        setCurrentAnswer(arr.filter((item) => item !== opt));
      } else {
        setCurrentAnswer([...arr, opt]);
      }
    } else {
      setCurrentAnswer([opt]);
    }
  };

  const renderQuestionUI = () => {
    switch (currentQuestion.type) {
      case "text":
        return (
          <Textarea
            value={Array.isArray(currentAnswer) ? currentAnswer.join("") : currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder="자유롭게 입력해주세요..."
            className="min-h-[150px] text-lg p-4 bg-zinc-50 border-2 border-solid border-zinc-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus-visible:ring-indigo-500 shadow-sm"
          />
        );

      case "image-select":
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {currentQuestion.options?.map((opt, i) => {
              const isSelected = Array.isArray(currentAnswer) && currentAnswer.includes(opt);
              const imageUrl = currentQuestion.imageUrls?.[i] || "";
              
              return (
                <div
                  key={opt}
                  onClick={() => handleToggleAnswer(opt, true)}
                  className={`relative cursor-pointer rounded-2xl overflow-hidden aspect-square border-2 border-solid transition-all ${
                    isSelected
                      ? "border-indigo-500 shadow-[0_4px_15px_rgba(99,102,241,0.2)] scale-[1.03]"
                      : "border-zinc-300 hover:border-zinc-400 hover:scale-[1.02]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={opt} className="w-full h-full object-cover p-1 rounded-[14px]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent pointer-events-none rounded-[14px]" />
                  <div className="absolute bottom-3 left-3 right-3 text-white font-bold text-sm md:text-base pointer-events-none">
                    {opt}
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center text-white font-bold text-sm">
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case "word-select":
        return (
          <div className="flex flex-wrap gap-3">
            {currentQuestion.options?.map((opt) => {
              const isSelected = Array.isArray(currentAnswer) && currentAnswer.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => handleToggleAnswer(opt, true)}
                  className={`px-5 py-3 rounded-full text-base font-semibold transition-all border-2 border-solid ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-400 text-indigo-700 shadow-sm scale-105"
                      : "bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );

      case "game":
        return (
          <div className="flex flex-col gap-4 mt-6">
            {currentQuestion.options?.map((opt) => {
              const isSelected = Array.isArray(currentAnswer) && currentAnswer.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => handleToggleAnswer(opt, false)}
                  className={`w-full p-6 text-left rounded-2xl text-lg font-bold transition-all border-2 border-solid ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-400 text-indigo-700 shadow-[0_4px_15px_rgba(99,102,241,0.2)] scale-[1.02]"
                      : "bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  const isNextDisabled = currentAnswer.length === 0;

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
