"use client";

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2.5">
        {chips.map((chip) => {
          const selected = selectedIds.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onToggle(chip.id)}
              className={cn(
                "rounded-full border border-solid px-4 py-2.5 text-sm font-medium backdrop-blur-xl transition-all",
                selected
                  ? "border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)]"
                  : "border-white/70 bg-white/80 text-ink hover:border-sky-300 active:scale-[0.98]",
              )}
            >
              {chip.text}
            </button>
          );
        })}
      </div>
      <Textarea
        value={freeText}
        onChange={(e) => onFreeText(e.target.value)}
        placeholder={placeholder}
        className="min-h-[90px] rounded-2xl border border-solid border-white/70 bg-white/80 p-4 text-base shadow-[0_8px_24px_rgba(37,99,235,0.08)] backdrop-blur-xl focus-visible:ring-sky-500"
      />
    </div>
  );
}
