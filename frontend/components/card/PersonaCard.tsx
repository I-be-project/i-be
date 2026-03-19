"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PersonaResult } from "@/store/useSessionStore";
import { QrCode, ScanFace, Sparkles } from "lucide-react";

export function CardFront({ persona }: { persona: PersonaResult }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-zinc-900 to-indigo-950 rounded-2xl p-6 text-white shadow-[inset_0_0_50px_rgba(99,102,241,0.2)] flex flex-col justify-between overflow-hidden relative border border-white/10">
      {/* Background decoration */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 blur-[80px] rounded-full" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/20 blur-[80px] rounded-full" />
      
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <div className="text-xs font-mono tracking-widest text-indigo-300/80 mb-1">
            2026 NA-BE MULTIVERSE
          </div>
          <h2 className="text-2xl font-black leading-none drop-shadow-md">
            {persona.name}
          </h2>
        </div>
        <ScanFace className="w-8 h-8 text-indigo-400 opacity-80" />
      </div>

      <div className="relative z-10 my-6 bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-inner">
        <p className="text-sm text-indigo-100 italic leading-relaxed">
          "{persona.tagline}"
        </p>
      </div>

      <div className="relative z-10 flex justify-between items-end">
        <div className="flex flex-wrap gap-1.5 w-[70%]">
          {persona.keywords.map((kw) => (
            <span key={kw} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-white/10 rounded-md text-indigo-200">
              #{kw}
            </span>
          ))}
        </div>
        <div className="w-16 h-16 bg-white rounded-lg p-1.5 flex flex-col items-center justify-center">
          <QrCode className="w-full h-full text-zinc-900" />
        </div>
      </div>
    </div>
  );
}

export function CardBack({ persona }: { persona: PersonaResult }) {
  return (
    <div className="w-full h-full bg-zinc-50 rounded-2xl p-6 text-zinc-900 flex flex-col justify-between overflow-hidden relative border border-zinc-200">
      {/* Decorative */}
      <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-indigo-50 to-transparent" />

      <div className="relative z-10">
        <div className="flex items-center space-x-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <h3 className="font-bold text-lg text-zinc-800">추천 활동 영역</h3>
        </div>
        
        <div className="space-y-2.5">
          {persona.fields.map((field) => (
            <div key={field} className="text-sm font-semibold bg-white p-3 rounded-lg shadow-sm border border-zinc-100 flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-indigo-400 before:rounded-full before:mr-3">
              {field}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-6 bg-zinc-900 text-white p-4 rounded-xl shadow-lg border-b-4 border-indigo-500">
        <h4 className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-1">
          오늘의 미션
        </h4>
        <p className="text-sm font-medium leading-relaxed">
          {persona.recommendedBooths[0]} 부스에 방문해서 도장을 받아오세요!
        </p>
      </div>
      
      <div className="text-center mt-4 text-[10px] text-zinc-400 font-mono">
        UID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
      </div>
    </div>
  );
}

export function PersonaCard({ persona }: { persona: PersonaResult }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="relative w-full max-w-[320px] aspect-[1/1.6] mx-auto perspective-1000 group cursor-pointer" style={{ perspective: "1000px" }}>
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front */}
        <div className="absolute inset-0 shadow-2xl rounded-2xl" style={{ backfaceVisibility: "hidden" }}>
          <CardFront persona={persona} />
        </div>
        
        {/* Back */}
        <div className="absolute inset-0 shadow-2xl rounded-2xl" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <CardBack persona={persona} />
        </div>
      </motion.div>
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6 opacity-0 group-hover:opacity-100 transition-opacity translate-y-4">
        카드를 탭하여 뒤집기
      </p>
    </div>
  );
}
