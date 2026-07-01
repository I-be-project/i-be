"use client";

import { PersonaResult } from "@/store/useSessionStore";
import { QrCode, User, Hexagon } from "lucide-react";

export function PersonaCard({ persona }: { persona: PersonaResult }) {
  // Mock name for the user
  const userName = "김미래";

  return (
    <div className="w-full max-w-[520px] aspect-[1.58/1] mx-auto bg-zinc-950 rounded-[20px] overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-zinc-800 flex">
      {/* Premium Clean Overlay (Monochrome) */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/20 via-transparent to-transparent opacity-40 z-10 pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-zinc-100/5 to-transparent z-0 blur-x" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-zinc-100/5 to-transparent z-0 blur-2xl" />
     
      {/* Content wrapper */}
      <div className="relative z-20 flex w-full p-4 sm:p-6 gap-4 sm:gap-6 h-full">
        {/* Left Column - Photo & QR */}
        <div className="flex flex-col items-center justify-between w-[32%] sm:w-[30%] border-r border-zinc-800 pr-4 sm:pr-5 h-full relative">
         
          <div className="w-full aspect-[3/4] rounded-lg sm:rounded-xl bg-zinc-900 border border-zinc-800 shadow-inner overflow-hidden relative group mt-1 sm:mt-0">
            {/* Minimal glowing avatar background */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 opacity-60" />
            <User className="absolute inset-0 m-auto w-8 h-8 sm:w-10 sm:h-10 text-zinc-600 z-0 drop-shadow-md" />
            <div className="absolute inset-0 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] pointer-events-none z-10" />
            
            {/* ID Text over photo */}
            <div className="absolute bottom-1.5 sm:bottom-2 left-0 right-0 text-center text-[8px] sm:text-[10px] text-zinc-300 font-mono tracking-widest z-20 bg-black/60 backdrop-blur-sm py-1 border-t border-zinc-800">
              {userName}
            </div>
          </div>
          
          <div className="w-full max-w-[60px] sm:max-w-[70px] aspect-square bg-zinc-900 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-zinc-800 shadow-md flex items-center justify-center mt-auto mb-1 sm:mb-0">
            <QrCode className="w-full h-full text-zinc-400" strokeWidth={1.5} />
          </div>
        </div>

        {/* Right Column - Info */}
        <div className="flex flex-col w-[68%] sm:w-[70%] h-full justify-between py-1">
          <div>
            <div className="flex items-start mb-2 group">
              <div>
                <h3 className="text-[9px] sm:text-[10px] md:text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-1 sm:mb-1.5 flex items-center gap-1 sm:gap-1.5">
                  <Hexagon className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-zinc-600" />
                  Analyzed Class
                </h3>
                <h2 className="text-base sm:text-xl md:text-2xl font-black text-white leading-tight mt-0.5 sm:mt-1 tracking-tight break-keep">
                  {persona.name}
                </h2>
              </div>
            </div>

            <div className="mt-2 sm:mt-3">
              <p className="text-[10px] sm:text-xs md:text-sm font-medium text-zinc-400 leading-snug sm:leading-relaxed max-w-full opacity-90 break-keep line-clamp-3 sm:line-clamp-none">
                "{persona.tagline}"
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:gap-3 mt-auto">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-[9px] sm:text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none mt-0.5">분야</div>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {persona.keywords.slice(0, 4).map((kw) => (
                <span key={kw} className="text-[8px] sm:text-[10px] font-bold tracking-wider px-2 sm:px-2.5 py-1 sm:py-1.5 bg-zinc-900 border border-zinc-800 rounded-md sm:rounded-lg text-zinc-300 shadow-sm whitespace-nowrap">
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
