"use client";

import { Check } from "lucide-react";

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
  variant?: "default" | "location";
}

const splitLocationLabel = (label: string) => {
  const [name, ...description] = label.split(/\s*[·•]\s*/);
  return { name: name.trim(), description: description.join(" · ").trim() };
};

export function RankSelect({
  options,
  first,
  second,
  onChange,
  variant = "default",
}: RankSelectProps) {
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
        const location = splitLocationLabel(opt.label);

        if (variant === "location") {
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected}
              onClick={() => handleClick(opt.id)}
              className={cn(
                "flex min-h-[74px] w-full items-center justify-between gap-4 rounded-[21px] border px-5 py-3.5 text-left backdrop-blur-[8px] transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FA6D9] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                selected
                  ? "border-[#7FA6D9] bg-[#E9ECFA]/95 shadow-[0_8px_22px_rgba(61,82,132,0.16)]"
                  : "border-white/55 bg-white/80 shadow-[0_5px_16px_rgba(46,58,96,0.08)] hover:bg-white/90",
              )}
            >
              <span className="min-w-0">
                <span className="block break-keep text-[17px] font-extrabold leading-tight text-ink">
                  {location.name}
                </span>
                {(location.description || opt.description) && (
                  <span className="mt-1 block break-keep text-[14px] font-medium leading-[1.45] text-ink/70">
                    {location.description || opt.description}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5E82C3] text-white shadow-sm transition-[opacity,transform]",
                  selected ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            </button>
          );
        }

        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={selected}
            onClick={() => handleClick(opt.id)}
            className={cn(
              "flex w-full items-center gap-3.5 rounded-2xl border border-solid p-4 text-left text-[15px] font-medium backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)]"
                : "border-white/70 bg-white/80 text-ink shadow-[0_8px_24px_rgba(37,99,235,0.08)] hover:border-sky-300 active:scale-[0.99]",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-solid text-sm font-bold transition-colors",
                selected
                  ? "border-white bg-white/30 text-white"
                  : "border-sky-300 bg-white/60 text-sky-500",
              )}
              aria-hidden
            >
              {rank ?? ""}
            </span>
            <span className="flex flex-col">
              <span className="break-keep leading-relaxed">{opt.label}</span>
              {opt.description && (
                <span
                  className={cn(
                    "mt-1 break-keep text-sm leading-relaxed",
                    selected ? "text-white/85" : "text-ink-muted",
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
