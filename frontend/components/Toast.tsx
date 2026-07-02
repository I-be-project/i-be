"use client";

// 의존성 없는 가벼운 토스트. framer-motion으로 기존 화면 진입 애니메이션 톤을 따른다.
// 사용처에서 message 상태를 관리하고, null이면 사라진다.

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X } from "lucide-react";

export type ToastVariant = "info" | "error";

interface ToastProps {
  message: string | null;
  variant?: ToastVariant;
  onClose: () => void;
}

export function Toast({ message, variant = "info", onClose }: ToastProps) {
  const isError = variant === "error";

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <div className="flex max-w-md items-start gap-3 rounded-2xl border border-solid border-white/70 bg-white/95 px-5 py-4 shadow-[0_12px_32px_rgba(13,48,71,0.15)] backdrop-blur-xl">
            {isError ? (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
            )}
            <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-zinc-700">
              {message}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="ml-1 shrink-0 rounded-md p-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
