import Image from "next/image";
import type { ReactNode } from "react";
import { HanmadangBackground } from "./HanmadangBackground";

export function TabPage({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <main className="relative min-h-[100dvh] px-5 pb-28 pt-7 font-sans">
    <HanmadangBackground />
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3"><Image src="/logo-hanmadang.png" alt="제12회 청소년 나Be한마당" width={720} height={523} priority className="h-14 w-auto self-start" />{action}</div>
      <header><h1 className="text-[28px] font-extrabold text-hm-blue">{title}</h1>{description && <p className="mt-1.5 text-sm font-medium text-hm-blue/70">{description}</p>}</header>
      {children}
    </div>
  </main>;
}

export function ProfileFeedback({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <div role="status" className="hm-card p-8 text-center text-sm font-bold text-hm-blue">탐험 기록을 불러오는 중…</div>;
  if (error) return <div role="alert" className="hm-card p-6 text-sm text-hm-blue"><p>{error}</p><button onClick={retry} className="mt-4 rounded-full bg-hm-blue px-5 py-2 font-bold text-white">다시 시도</button></div>;
  return null;
}
