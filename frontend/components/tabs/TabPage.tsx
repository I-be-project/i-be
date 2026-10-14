"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { HanmadangBackground } from "./HanmadangBackground";
import { paperlogy } from "@/lib/fonts";
import { useProfileView } from "./ProfileView";

export function TabPage({ title, description, action, leading, children }: { title?: string; description?: string; action?: ReactNode; leading?: ReactNode; children: ReactNode }) {
  // 공개 페이지(/p/[code])엔 카메라 플로팅 버튼이 없으므로 하단 네비 높이만큼만 띄운다.
  const { readOnly } = useProfileView();
  return <main className={`${paperlogy.className} relative min-h-[100dvh] touch-pan-y touch-pinch-zoom overflow-x-clip px-5 ${readOnly ? "pb-24" : "pb-44"} pt-4`}>
    <HanmadangBackground />
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="-mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Image src="/logo-hanmadang.png" alt="제12회 청소년 나Be한마당" width={1000} height={258} priority className="col-start-2 h-8 w-auto" />
        {leading && <div className="col-start-1 row-start-1 justify-self-start">{leading}</div>}
        {action && <div className="col-start-3 row-start-1 justify-self-end">{action}</div>}
      </div>
      {(title || description) && <header>{title && <h1 className="text-[28px] font-extrabold text-hm-blue">{title}</h1>}{description && <p className="mt-1.5 text-sm font-medium text-hm-blue/70">{description}</p>}</header>}
      {children}
    </div>
  </main>;
}

export function ProfileFeedback({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <div role="status" className="hm-card p-8 text-center text-sm font-bold text-hm-blue">탐험 기록을 불러오는 중…</div>;
  if (error) return <div role="alert" className="hm-card p-6 text-sm text-hm-blue"><p>{error}</p><button onClick={retry} className="mt-4 rounded-full bg-hm-blue px-5 py-2 font-bold text-white">다시 시도</button></div>;
  return null;
}
