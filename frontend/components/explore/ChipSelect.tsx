"use client";

import { Check } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Chip {
  id: string;
  text: string;
}

interface ChipSelectProps {
  chips: Chip[];
  selectedIds: string[];
  freeText: string;
  placeholder: string;
  onToggle: (id: string) => void;
  onFreeText: (v: string) => void;
}

export function ChipSelect({
  chips,
  selectedIds,
  freeText,
  placeholder,
  onToggle,
  onFreeText,
}: ChipSelectProps) {
  return (
    // Q7(RankSelect)처럼 세로로 쌓인 카드 목록 — 칩과 직접 작성 칸의 크기(min-h/rounded/padding)를 동일하게.
    <div className="flex flex-col gap-3">
      {chips.map((chip) => {
        const selected = selectedIds.includes(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(chip.id)}
            className={cn(
              // 선택 색상은 부모가 주입한 CSS 변수(--scene-*)로 단계별 팔레트를 따른다.
              // border 강조는 Q1~6과 통일 — 미선택 1px, 선택 시 2px.
              "flex min-h-[58px] w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left text-[14px] font-medium leading-[1.5] text-ink backdrop-blur-[8px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-accent)]",
              selected
                ? "border-2 border-[var(--scene-accent)] bg-[var(--scene-option-selected)] shadow-[0_6px_18px_rgba(13,48,71,0.10)]"
                : "border-white/70 bg-white/80 shadow-[0_5px_16px_rgba(46,58,96,0.08)] hover:border-[var(--scene-accent)] hover:bg-white/90",
            )}
          >
            <span className="min-w-0 flex-1 break-keep">{chip.text}</span>
            {selected && (
              <Check
                className="h-5 w-5 shrink-0 text-[var(--scene-check)]"
                strokeWidth={2.6}
              />
            )}
          </button>
        );
      })}
      <Textarea
        value={freeText}
        onChange={(e) => onFreeText(e.target.value)}
        placeholder={placeholder}
        // 포커스 강조를 답변 카드와 통일 — ring 대신 2px accent border(미선택 1px → 포커스 2px).
        // 폰트는 16px — iOS Safari는 16px 미만 입력창에 포커스하면 화면을 자동 확대(줌)한다.
        className="min-h-[58px] rounded-[18px] border border-solid border-white/70 bg-white/80 px-4 py-3 text-[16px] shadow-[0_5px_16px_rgba(46,58,96,0.08)] backdrop-blur-[8px] focus-visible:border-2 focus-visible:border-[var(--scene-accent)] focus-visible:ring-0"
      />
    </div>
  );
}
