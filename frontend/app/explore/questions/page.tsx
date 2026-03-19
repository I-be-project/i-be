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
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleNext = () => {
    // Save answer
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
            className="min-h-[150px] text-lg p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500"
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
                  className={`relative cursor-pointer rounded-2xl overflow-hidden aspect-square border-2 transition-all ${
                    isSelected
                      ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-105"
                      : "border-transparent hover:scale-[1.02]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={opt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-white font-bold text-sm md:text-base">
                    {opt}
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white">
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
                  className={`px-5 py-3 rounded-full text-base font-medium transition-all ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
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
                  className={`w-full p-6 text-left rounded-2xl text-lg font-bold transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-xl scale-[1.02]"
                      : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500/50"
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
    <main className="min-h-[100dvh] flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-3xl mx-auto px-6 py-8">
        <Progress value={progress} className="h-2 mb-8 bg-zinc-200 dark:bg-zinc-800" />
        
        <div className="text-zinc-400 font-medium text-sm mb-2 tracking-widest uppercase">
          Question {currentIndex + 1} of {questions.length}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex flex-col h-full"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-10 leading-tight">
              {currentQuestion.text}
            </h2>

            <div className="flex-grow mb-16">
              {renderQuestionUI()}
            </div>
            
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent dark:from-zinc-950 dark:via-zinc-950 z-10 flex justify-center">
              <Button
                size="lg"
                onClick={handleNext}
                disabled={isNextDisabled}
                className="w-full max-w-3xl h-14 rounded-xl text-base font-bold shadow-xl transition-all"
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
