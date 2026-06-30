"use client";

import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratingScreenProps {
  error: string | null;
  onRetry: () => void;
}

export function GeneratingScreen({ error, onRetry }: GeneratingScreenProps) {
  if (error) {
    return (
      <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
        <AlertCircle className="h-12 w-12 text-rose-400" />
        <p className="max-w-sm text-lg font-bold text-[#2a2550]">{error}</p>
        <Button
          size="lg"
          onClick={onRetry}
          className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-8 font-bold text-white"
        >
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      >
        <Loader2 className="h-12 w-12 text-indigo-500" />
      </motion.div>
      <p className="text-lg font-bold text-[#2a2550]">
        선택을 바탕으로 다음 탐험길을 준비하고 있어요…
      </p>
    </div>
  );
}
