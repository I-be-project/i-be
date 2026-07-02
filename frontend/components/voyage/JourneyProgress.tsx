"use client";

import { Compass } from "lucide-react";

// 탐험 진행 헤더 — 질문(1~6)과 심화(7~10)가 하나의 지도를 공유한다.
// 항상 전체 여정(10) 기준으로 채워서 "한 번의 원정"으로 느껴지게 한다.
// ui/Progress(base-ui)는 Track/Indicator 구조라 외부에서 색을 덮기 어려워 직접 그린다.
export function JourneyProgress({
  label,
  step,
  total,
}: {
  label: string;
  step: number;
  total: number;
}) {
  return (
    <div className="mb-8">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={label}
        className="mb-3 h-2 overflow-hidden rounded-full border border-solid border-white/70 bg-white/60"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-500"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-sm font-bold text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <Compass className="h-4 w-4 text-sky-500" />
          {label}
        </span>
        <span>
          {step} / {total}
        </span>
      </div>
    </div>
  );
}
