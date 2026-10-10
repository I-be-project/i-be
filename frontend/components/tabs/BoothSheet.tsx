"use client";

import type { ProfileBoothStatus } from "@/lib/api";
import { competencyLabel, ZONE_LABELS } from "@/lib/competencies";
import { paperlogy } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ZoneBlock } from "./BoothList";

const visitedAt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

// 부스를 누르면 아래에서 올라오는 상세 시트. 학생 프로필 응답에 있는 부스 정보만 보여준다.
// open과 booth를 따로 받는다 — 닫히는 애니메이션 동안에도 내용이 남아 있게.
export function BoothSheet({ booth, open, personaKeywords = [], onClose }: { booth: ProfileBoothStatus | null; open: boolean; personaKeywords?: string[]; onClose: () => void }) {
  const mine = new Set(personaKeywords.map((keyword) => competencyLabel(keyword.trim().replace(/^#/, ""))));
  const zone = booth?.zone ?? "";
  return <Sheet open={open && booth !== null} onOpenChange={(open) => !open && onClose()}>
    <SheetContent side="bottom" showCloseButton={false} className={cn(paperlogy.className, "mx-auto max-h-[85dvh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-3xl border-0 bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-hm-blue")}>
      {booth && <>
        <div className="flex items-center gap-2 text-sm font-bold text-hm-blue/70"><ZoneBlock zone={zone} />{ZONE_LABELS[zone]}</div>
        <SheetTitle className="mt-2.5 break-keep text-[1.45rem] font-extrabold leading-snug text-hm-blue">{booth.name}</SheetTitle>
        {booth.description ? <SheetDescription className="mt-1 text-sm text-hm-blue/70">{zone === "C" ? "미션 · " : ""}{booth.description}</SheetDescription> : <SheetDescription className="sr-only">부스 상세 정보</SheetDescription>}
        {booth.detail && <p className="mt-4 whitespace-pre-line break-keep text-[0.95rem] leading-relaxed text-hm-blue">{booth.detail}</p>}
        <p className={cn("mt-4 rounded-2xl px-4 py-3 text-sm font-bold", booth.visited ? "bg-hm-teal/10 text-hm-teal" : "bg-hm-tint text-hm-blue/70")}>
          {booth.visited ? `참여 완료${booth.visited_at ? ` · ${visitedAt(booth.visited_at)}` : ""}` : "아직 참여 전이야. 부스에서 QR을 찍으면 기록돼."}
        </p>
        {!!booth.competencies?.length && <div className="mt-4 border-t border-[#e9eff5] pt-4">
          <h3 className="text-sm font-extrabold">얻을 수 있는 역량</h3>
          <ul className="mt-2 flex flex-col gap-1.5">{booth.competencies.map((key) => {
            const label = competencyLabel(key);
            return <li key={key} className={cn("text-sm", mine.has(label) ? "font-extrabold text-hm-blue" : "text-hm-blue/70")}>· {label}{mine.has(label) && <span className="ml-1.5 text-xs font-bold text-hm-coral">내 키워드</span>}</li>;
          })}</ul>
        </div>}
        <SheetClose className="mt-6 w-full rounded-2xl bg-hm-blue py-3.5 text-sm font-extrabold text-white">닫기</SheetClose>
      </>}
    </SheetContent>
  </Sheet>;
}
