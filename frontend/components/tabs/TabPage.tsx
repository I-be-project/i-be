import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HanmadangBackground } from "./HanmadangBackground";

export function TabPage({ title, description, action, logo = true, children }: { title?: string; description?: string; action?: ReactNode; logo?: boolean; children: ReactNode }) {
  return <main className={cn("relative min-h-[100dvh] touch-pan-y touch-pinch-zoom overflow-x-clip px-5 pb-28 font-sans", logo ? "pt-4" : "pt-7")}>
    <HanmadangBackground />
    <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6">
      {(logo || action) && <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-3", logo && "-mb-2")}>
        {logo && <Image src="/logo-hanmadang.png" alt="제12회 청소년 나Be한마당" width={1000} height={258} priority className="col-start-2 h-8 w-auto" />}
        {action && <div className="col-start-3 row-start-1 justify-self-end">{action}</div>}
      </div>}
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
