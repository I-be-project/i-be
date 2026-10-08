"use client";

import { useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlippablePersonaCard({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [flipped, setFlipped] = useState(false);
  if (!enabled) return <>{children}</>;

  return <div>
    <div
      role="button"
      tabIndex={0}
      aria-label={flipped ? "페르소나 카드 앞면 보기" : "페르소나 카드 뒤집어 안내 보기"}
      aria-pressed={flipped}
      onClick={() => setFlipped((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFlipped((value) => !value);
        }
      }}
      className="cursor-pointer rounded-xl outline-none [perspective:1200px] focus-visible:ring-2 focus-visible:ring-hm-blue focus-visible:ring-offset-4"
    >
      <div className={cn("grid transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none", flipped && "[transform:rotateY(180deg)]")}>
        <div aria-hidden={flipped} className="col-start-1 row-start-1 [backface-visibility:hidden]">{children}</div>
        <div aria-hidden={!flipped} className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-4 rounded-xl border border-hm-blue/15 bg-hm-tint px-6 py-8 text-center text-hm-blue [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="max-w-sm break-keep text-lg font-extrabold leading-relaxed sm:text-xl">15:00 이후, 내가 체험한 역량을 바탕으로 달라진 미래의 내 모습을 확인해보세요!</p>
        </div>
      </div>
    </div>
    <p aria-hidden="true" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-hm-blue/60"><RotateCcw className="h-3.5 w-3.5" />{flipped ? "카드를 누르면 앞면으로 돌아가요" : "카드를 눌러 뒷면을 확인해보세요"}</p>
  </div>;
}
