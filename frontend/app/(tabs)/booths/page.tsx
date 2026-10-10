"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { RecommendSection, SOFT_CARD, ZoneSection } from "@/components/tabs/BoothList";
import { recommendBooths } from "@/lib/boothRecommendations";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { BoothSheet } from "@/components/tabs/BoothSheet";
import type { ProfileBoothStatus } from "@/lib/api";
import { ZONE_SHORT, type BoothZone } from "@/lib/competencies";
import { cn } from "@/lib/utils";
import { COMPETENCY_ZONE_COLOR, COMPETENCY_ZONE_INK } from "@/lib/zoneColors";

// 탭 버튼 — 추천 또는 존 하나만 보여준다. 고른 탭은 존 색(추천은 블루)으로 채운다.
type Tab = Exclude<BoothZone, ""> | "recommended";
const TABS: Tab[] = ["recommended", "F", "L", "Y", "C"];
const TAB_LABEL: Record<Tab, string> = { recommended: "추천", F: ZONE_SHORT.F, L: ZONE_SHORT.L, Y: ZONE_SHORT.Y, C: ZONE_SHORT.C };
const ZONE_BUTTON = {
  recommended: { active: "bg-hm-blue text-white", inactive: "text-hm-blue" },
  F: { active: "bg-hm-blue text-white", inactive: "text-hm-blue" },
  L: { active: "bg-hm-coral text-white", inactive: "text-hm-coral" },
  Y: { active: "bg-hm-teal text-white", inactive: "text-hm-teal" },
  C: { active: "text-white", inactive: "" },
} as const;

export default function BoothsPage() {
  const { profile, readOnly, ...feedback } = useProfileView();
  const [mapFailed, setMapFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("recommended");
  const [selected, setSelected] = useState<ProfileBoothStatus | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openBooth = (booth: ProfileBoothStatus) => { setSelected(booth); setSheetOpen(true); };
  const q = query.trim().toLowerCase();
  const all = profile?.booths ?? [];
  const source = tab === "recommended" ? recommendBooths(all, profile?.persona ?? null) : all.filter((b) => b.zone === tab).sort((a, b) => Number(a.visited) - Number(b.visited)); // 참여 완료는 맨 아래로(나머지 순서는 유지)
  const booths = source.filter((b) => `${b.name} ${b.description ?? ""} ${b.detail ?? ""}`.toLowerCase().includes(q));
  return <TabPage action={readOnly ? <MyPageLink /> : undefined}>
    <section className={`${SOFT_CARD} overflow-hidden`} aria-label="부스 맵">
      {mapFailed ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-hm-blue"><p className="text-sm font-bold">지도를 준비하고 있어</p><p className="text-xs text-hm-blue/60">아래 목록에서 체험할 부스를 먼저 찾아봐.</p></div> : <div className="relative aspect-[1672/941] w-full"><Image src="/booth-map.webp" alt="나Be한마당 부스 배치도" fill sizes="(min-width: 672px) 632px, 100vw" className="object-cover" onError={() => setMapFailed(true)} /></div>}
    </section>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <section className="flex flex-col gap-3.5">
      <label className={`${SOFT_CARD} flex items-center gap-2 rounded-2xl px-4 py-3 text-hm-blue`}><Search size={18} /><input aria-label="부스 이름 또는 체험 검색" placeholder="어떤 체험을 찾고 있어?" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hm-blue/45" /></label>
      <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="부스 보기 선택">{TABS.map((value) => {
        const on = tab === value;
        return <button key={value} type="button" role="tab" aria-selected={on} onClick={() => setTab(value)}
          style={value === "C" ? (on ? { backgroundColor: COMPETENCY_ZONE_COLOR } : { color: COMPETENCY_ZONE_INK }) : undefined}
          className={cn(SOFT_CARD, "rounded-xl py-2.5 text-xs font-extrabold", on ? ZONE_BUTTON[value].active : ZONE_BUTTON[value].inactive)}>{TAB_LABEL[value]}</button>;
      })}</div>
      {tab === "recommended" ? <RecommendSection booths={booths} personaKeywords={profile.persona?.keywords} onSelect={openBooth} /> : <ZoneSection zone={tab} booths={booths} personaKeywords={profile.persona?.keywords} onSelect={openBooth} />}
      <BoothSheet booth={selected} open={sheetOpen} personaKeywords={profile.persona?.keywords} onClose={() => setSheetOpen(false)} />
    </section>}
  </TabPage>;
}
