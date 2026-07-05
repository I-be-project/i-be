"use client";

import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getPictogramForRiasec } from "@/lib/assets/choicePictograms";
import type { RiasecType } from "@/lib/mock/questions";

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  /** RIASEC 기반 픽토그램 (Q1–6) */
  riasec?: RiasecType;
  /** 커스텀 아이콘 (Q8/Q9 LLM 선택지) */
  icon?: LucideIcon;
}

interface ChoiceRowProps {
  options: ChoiceOption[];
  /** single 선택 (기본) */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** RankSelect 호환: 2개 선택 시 rank 표시 */
  rankMode?: "single" | "rank";
  first?: string | null;
  second?: string | null;
  onRankChange?: (first: string | null, second: string | null) => void;
  /** Q1~6 파스텔 테마 — 아이콘 없이 텍스트+체크, 장면 CSS 변수(--scene-*)로 색을 입힌다 */
  themed?: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export function ChoiceRow({
  options,
  selectedId,
  onSelect,
  rankMode = "single",
  first = null,
  second = null,
  onRankChange,
  themed = false,
}: ChoiceRowProps) {
  const handleRankClick = (id: string) => {
    if (!onRankChange) return;
    if (id === first) return onRankChange(null, second);
    if (id === second) return onRankChange(first, null);
    if (first === null) return onRankChange(id, second);
    if (second === null) return onRankChange(first, id);
    onRankChange(first, id);
  };

  const rankOf = (id: string) => (id === first ? 1 : id === second ? 2 : null);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      className={cn("flex flex-col", themed ? "gap-3" : "gap-2.5")}
    >
      {options.map((opt) => {
        const rank = rankMode === "rank" ? rankOf(opt.id) : null;
        const selected =
          rankMode === "rank" ? rank !== null : selectedId === opt.id;

        // Q1~6 파스텔 테마 — 왼쪽 아이콘 없이 텍스트만, 선택 시 accent 테두리 + 체크로 표시.
        if (themed) {
          return (
            <motion.button
              key={opt.id}
              type="button"
              variants={itemVariants}
              aria-pressed={selected}
              onClick={() =>
                rankMode === "rank"
                  ? handleRankClick(opt.id)
                  : onSelect?.(opt.id)
              }
              className={cn(
                "flex min-h-[74px] w-full items-center justify-between gap-3 rounded-[22px] px-[22px] py-4 text-left text-[15px] font-medium leading-[1.55] text-ink backdrop-blur-[8px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-accent)]",
                selected
                  ? "border-2 border-[var(--scene-accent)] bg-[var(--scene-option-selected)] shadow-[0_6px_18px_rgba(13,48,71,0.10)]"
                  : "border border-[var(--scene-option-border)] bg-[var(--scene-option-bg)] shadow-[0_2px_10px_rgba(13,48,71,0.06)] hover:border-[var(--scene-accent)] active:scale-[0.99]",
              )}
            >
              <span className="min-w-0 flex-1 break-keep">{opt.label}</span>
              {selected && (
                <Check
                  className="h-5 w-5 flex-shrink-0 text-[var(--scene-accent)]"
                  strokeWidth={2.6}
                />
              )}
            </motion.button>
          );
        }

        const Icon = opt.icon ?? getPictogramForRiasec(opt.riasec);
        return (
          <motion.button
            key={opt.id}
            type="button"
            variants={itemVariants}
            onClick={() =>
              rankMode === "rank"
                ? handleRankClick(opt.id)
                : onSelect?.(opt.id)
            }
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border border-solid p-3.5 text-left text-[15px] font-medium backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)]"
                : "border-white/70 bg-white/80 text-ink shadow-[0_8px_24px_rgba(37,99,235,0.08)] hover:border-sky-300 active:scale-[0.99]",
            )}
          >
            {rankMode === "rank" && (
              <span
                className={cn(
                  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-solid text-sm font-bold",
                  selected
                    ? "border-white bg-white/30 text-white"
                    : "border-sky-300 bg-white/60 text-sky-500",
                )}
              >
                {rank ?? ""}
              </span>
            )}
            <span
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
                selected ? "bg-white/25 text-white" : "bg-sky-100 text-sky-600",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="break-keep leading-relaxed">{opt.label}</span>
              {opt.description && (
                <span
                  className={cn(
                    "mt-0.5 break-keep text-sm leading-relaxed",
                    selected ? "text-white/85" : "text-ink-muted",
                  )}
                >
                  {opt.description}
                </span>
              )}
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
