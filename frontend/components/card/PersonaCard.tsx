"use client";

import { PersonaResult } from "@/store/useSessionStore";
import { QrCode, User, Sparkles } from "lucide-react";

// 탐험대원증 — 깊은 바다 남색 위에 하늘빛 포인트.
// 화면(하늘·바다·모래)과 같은 세계관의 "밤바다" 버전으로, 발급되는 순간이 특별하게 느껴지도록.
export function PersonaCard({ persona }: { persona: PersonaResult }) {
  // Mock name for the user
  const userName = "김미래";

  return (
    <div className="relative mx-auto flex aspect-[1.58/1] w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[#1d4a5e] bg-gradient-to-br from-[#0d3047] via-[#0f3a56] to-[#134766] shadow-[0_20px_50px_rgba(13,48,71,0.4)]">
      {/* 하늘빛 글로우 — 카드 위에 떨어지는 달빛/별빛 */}
      <div className="pointer-events-none absolute -right-10 -top-14 z-0 h-40 w-40 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 z-0 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1/2 bg-gradient-to-b from-white/5 to-transparent" />

      {/* Content wrapper */}
      <div className="relative z-20 flex h-full w-full gap-4 p-4 sm:gap-6 sm:p-6">
        {/* Left Column - Photo & QR */}
        <div className="relative flex h-full w-[32%] flex-col items-center justify-between border-r border-white/10 pr-4 sm:w-[30%] sm:pr-5">
          <div className="group relative mt-1 aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/15 bg-[#0a2638] shadow-inner sm:mt-0 sm:rounded-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#12435f] to-[#0a2638] opacity-70" />
            <User className="absolute inset-0 z-0 m-auto h-8 w-8 text-sky-200/40 drop-shadow-md sm:h-10 sm:w-10" />
            <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_15px_rgba(0,0,0,0.6)]" />

            {/* ID Text over photo */}
            <div className="absolute bottom-1.5 left-0 right-0 z-20 border-t border-white/10 bg-[#081f2e]/70 py-1 text-center font-mono text-[8px] tracking-widest text-sky-100 backdrop-blur-sm sm:bottom-2 sm:text-[10px]">
              {userName}
            </div>
          </div>

          <div className="mb-1 mt-auto flex aspect-square w-full max-w-[60px] items-center justify-center rounded-lg border border-white/15 bg-white/90 p-1.5 shadow-md sm:mb-0 sm:max-w-[70px] sm:rounded-xl sm:p-2">
            <QrCode className="h-full w-full text-[#0d3047]" strokeWidth={1.5} />
          </div>
        </div>

        {/* Right Column - Info */}
        <div className="flex h-full w-[68%] flex-col justify-between py-1 sm:w-[70%]">
          <div>
            <div className="mb-2 flex items-start">
              <div>
                <h3 className="mb-1 flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-widest text-sky-300/80 sm:mb-1.5 sm:gap-1.5 sm:text-[10px] md:text-xs">
                  <Sparkles className="h-2.5 w-2.5 fill-sky-400 text-sky-400 sm:h-3 sm:w-3" />
                  나Be 탐험대원증
                </h3>
                <h2 className="mt-0.5 break-keep text-base font-black leading-tight tracking-tight text-white sm:mt-1 sm:text-xl md:text-2xl">
                  {persona.name}
                </h2>
              </div>
            </div>

            <div className="mt-2 sm:mt-3">
              <p className="line-clamp-3 max-w-full break-keep text-[10px] font-medium leading-snug text-sky-100/80 sm:line-clamp-none sm:text-xs sm:leading-relaxed md:text-sm">
                “{persona.tagline}”
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-sky-300/70 sm:text-[10px] md:text-xs">
                분야
              </div>
              <div className="h-px flex-1 bg-white/15" />
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {persona.keywords.slice(0, 4).map((kw) => (
                <span
                  key={kw}
                  className="whitespace-nowrap rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[8px] font-bold tracking-wider text-sky-100 shadow-sm sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-[10px]"
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
