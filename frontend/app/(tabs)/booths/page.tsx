"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { BoothList } from "@/components/tabs/BoothList";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { mockRecommendedBooths } from "@/lib/mock/recommendedBooths";
import { recommendBooths } from "@/lib/boothRecommendations";
import { ZONE_SHORT, type BoothZone } from "@/lib/competencies";
import { cn } from "@/lib/utils";

const FILTER_COLORS = {
  recommended: { active: "bg-hm-blue text-white", inactive: "bg-white text-hm-blue" },
  F: { active: "bg-hm-blue text-white", inactive: "bg-white text-hm-blue" },
  L: { active: "bg-hm-coral text-white", inactive: "bg-white text-hm-coral" },
  Y: { active: "bg-hm-teal text-white", inactive: "bg-white text-hm-teal" },
  C: { active: "bg-hm-blue text-white", inactive: "bg-white text-hm-blue" },
} as const;

export default function BoothsPage() {
  const { profile, readOnly, ...feedback } = useProfileView();
  const [mapFailed, setMapFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BoothZone | "recommended">("recommended");
  const booths = profile?.booths ?? [];
  const recommended = recommendBooths(booths, profile?.persona ?? null);
  const source = filter === "recommended" ? (recommended.length ? recommended : mockRecommendedBooths) : booths;
  const filtered = source.filter((b) => (filter === "recommended" || b.zone === filter) && `${b.name} ${b.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <TabPage action={readOnly ? <MyPageLink /> : undefined}>
    <section className="hm-card overflow-hidden" aria-label="부스 맵">
      {mapFailed ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-hm-blue"><p className="text-sm font-bold">지도를 준비하고 있어</p><p className="text-xs text-hm-blue/60">아래 목록에서 체험할 부스를 먼저 찾아봐.</p></div> : <div className="relative aspect-[4/3] w-full"><Image src="/booth-map.webp" alt="나Be한마당 부스 배치도" fill sizes="(min-width: 672px) 632px, 100vw" className="object-contain p-3" onError={() => setMapFailed(true)} /></div>}
    </section>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-extrabold text-hm-blue">부스 <span className="text-sm text-hm-blue/50">{booths.length}</span></h2>
        <label className="flex items-center gap-2 rounded-2xl border border-hm-pattern bg-white px-4 py-3 text-hm-blue"><Search size={18} /><input aria-label="부스 이름 또는 체험 검색" placeholder="어떤 체험을 찾고 있어?" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hm-blue/45" /></label>
        <div className="flex flex-wrap gap-2" aria-label="부스 필터">{(["recommended", "F", "L", "Y", "C"] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("rounded-full px-4 py-2 text-xs font-bold", filter === value ? FILTER_COLORS[value].active : FILTER_COLORS[value].inactive)}>{value === "recommended" ? "추천" : ZONE_SHORT[value]}</button>)}</div>
        <div className="min-h-[100dvh]">
          {filtered.length ? <BoothList booths={filtered} showZone={filter === "recommended"} /> : <p className="hm-card p-6 text-center text-sm text-hm-blue/70">{source.length ? "검색 조건에 맞는 부스가 없어." : "등록된 부스가 아직 없어."}</p>}
        </div>
      </section>
    </>}
  </TabPage>;
}
