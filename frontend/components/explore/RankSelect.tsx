"use client";

import { cn } from "@/lib/utils";

interface RankOption {
  id: string;
  label: string;
  description?: string;
}

interface RankSelectProps {
  options: RankOption[];
  first: string | null;
  second: string | null;
  onChange: (first: string | null, second: string | null) => void;
}

export function RankSelect({ options, first, second, onChange }: RankSelectProps) {
  const handleClick = (id: string) => {
    if (id === first) return onChange(null, second);
    if (id === second) return onChange(first, null);
    if (first === null) return onChange(id, second);
    if (second === null) return onChange(first, id);
    // 둘 다 찼으면 2순위 교체
    onChange(first, id);
  };

  const rankOf = (id: string) =>
    id === first ? 1 : id === second ? 2 : null;

  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const rank = rankOf(opt.id);
        const selected = rank !== null;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleClick(opt.id)}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border border-solid p-4 text-left text-base font-medium backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_12px_28px_rgba(124,77,229,0.35)]"
                : "border-white/70 bg-white/80 text-[#2a2550] shadow-[0_10px_30px_rgba(123,97,240,0.1)] hover:scale-[1.01] hover:border-indigo-300",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-solid text-sm font-bold transition-colors",
                selected
                  ? "border-white bg-white/30 text-white"
                  : "border-indigo-300 bg-white/60 text-indigo-400",
              )}
              aria-hidden
            >
              {rank ?? ""}
            </span>
            <span className="flex flex-col">
              <span className="leading-snug">{opt.label}</span>
              {opt.description && (
                <span
                  className={cn(
                    "mt-1 text-sm",
                    selected ? "text-white/80" : "text-[#5b5685]",
                  )}
                >
                  {opt.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
