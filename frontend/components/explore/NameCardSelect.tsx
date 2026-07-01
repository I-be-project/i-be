"use client";

import { cn } from "@/lib/utils";

interface NameCardItem {
  id: string;
  name: string;
  description: string;
  emphasis: string;
}

interface NameCardSelectProps {
  cards: NameCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function NameCardSelect({ cards, selectedId, onSelect }: NameCardSelectProps) {
  return (
    <div className="flex flex-col gap-4">
      {cards.map((card) => {
        const selected = card.id === selectedId;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={cn(
              "flex w-full flex-col gap-2 rounded-2xl border border-solid p-5 text-left backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_14px_30px_rgba(124,77,229,0.4)]"
                : "border-white/70 bg-white/80 text-[#2a2550] shadow-[0_10px_30px_rgba(123,97,240,0.1)] hover:scale-[1.01] hover:border-indigo-300",
            )}
          >
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-widest",
                selected ? "text-white/80" : "text-indigo-400",
              )}
            >
              {card.emphasis}
            </span>
            <span className="text-xl font-extrabold leading-tight">{card.name}</span>
            <span className={cn("text-sm", selected ? "text-white/85" : "text-[#5b5685]")}>
              {card.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
