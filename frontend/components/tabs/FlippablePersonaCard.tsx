"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// backImageUrl: 나비 그림(있을 때만). 없으면 기본 안내 이미지.
export function FlippablePersonaCard({ children, enabled, footer, backImageUrl }: { children: ReactNode; enabled: boolean; footer?: ReactNode; backImageUrl?: string | null }) {
  const [flipped, setFlipped] = useState(false);
  if (!enabled) return <>{children}{footer}</>;

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
      <div className={cn("relative grid transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none", flipped && "[transform:rotateY(-180deg)]")}>
        <div aria-hidden={flipped} className="col-start-1 row-start-1 [backface-visibility:hidden]">{children}</div>
        <div aria-hidden={!flipped} className="absolute inset-0 overflow-hidden rounded-xl bg-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {backImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backImageUrl} alt="부스 체험으로 달라진 미래의 내 모습" className="h-full w-full rounded-xl object-cover" />
          ) : <div className="relative isolate flex h-full flex-col items-center justify-center gap-5 px-6 text-center text-hm-blue">
            {/* 배경은 카드 합성(backend/app/assets/card/background.jpg)과 같은 미래 도시 — 축소본. */}
            <Image src="/card-back-bg.jpg" alt="" fill sizes="(max-width: 768px) 100vw, 632px" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/30 via-white/75 to-white/90" />
            <Image src="/logo-hanmadang-stacked.png" alt="제12회 청소년 나Be한마당" width={720} height={523} className="h-auto w-1/2" />
            <p className="text-3xl font-extrabold">15:00 이후</p>
            <p className="break-keep text-[15px] font-semibold leading-relaxed">나비한마당이 끝나고<br />내가 체험한 역량만큼<br />달라진 미래의 내 모습을 확인해보세요!</p>
          </div>}
        </div>
      </div>
    </div>
    {footer}
    <p aria-hidden="true" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-hm-blue/60"><RotateCcw className="h-3.5 w-3.5" />{flipped ? "카드를 누르면 앞면으로 돌아가요" : "카드를 눌러 뒷면을 확인해보세요"}</p>
  </div>;
}
