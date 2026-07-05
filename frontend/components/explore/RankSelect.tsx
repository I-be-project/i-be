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
  variant?: "default" | "location";
}

const splitLocationLabel = (label: string) => {
  // "장소이름 — 설명" (긴 줄표) 또는 "장소이름 · 설명" 형식을 이름/설명으로 분리한다.
  const [name, ...description] = label.split(/\s*[—–·•]\s*/);
  return { name: name.trim(), description: description.join(" ").trim() };
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
                // 선택 색상은 부모가 주입한 CSS 변수(--scene-*)로 단계별 팔레트를 따른다.
                "flex min-h-[74px] w-full items-center justify-between gap-4 rounded-[21px] border px-5 py-3.5 text-left backdrop-blur-[8px] transition-[transform,background-color,border-color,box-shadow] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                selected
                  ? "border-2 border-[var(--scene-accent)] bg-[var(--scene-option-selected)] shadow-[0_6px_18px_rgba(13,48,71,0.10)]"
                  : "border-white/55 bg-white/80 shadow-[0_5px_16px_rgba(46,58,96,0.08)] hover:border-[var(--scene-accent)] hover:bg-white/90",
              )}
            >
              <span className="min-w-0">
                <span className="block break-keep text-[15px] font-extrabold leading-tight text-ink">
                  {location.name}
                </span>
                {(location.description || opt.description) && (
                  <span className="mt-1 block break-keep text-[14px] font-medium leading-[1.45] text-ink/70">
                    {location.description || opt.description}
                  </span>
                )}
              </span>
              {selected && (
                // Q1~6 선택 체크와 동일한 자리·톤 — 아이콘 대신 순위 숫자(1·2)를 우측에 표시.
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-[20px] font-black leading-none text-[var(--scene-check)]"
                >
                  {rank}
                </span>
              )}
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
