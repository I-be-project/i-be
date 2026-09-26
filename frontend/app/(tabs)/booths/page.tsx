"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Map, Search } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { BoothList } from "@/components/tabs/BoothList";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { recommendBooths } from "@/lib/boothRecommendations";
import { ZONE_SHORT, type BoothZone } from "@/lib/competencies";

export default function BoothsPage() {
  const { profile, readOnly, basePath, ...feedback } = useProfileView();
  const [mapFailed, setMapFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<BoothZone | "all">("all");
  const booths = profile?.booths ?? [];
  const recommended = recommendBooths(booths, profile?.persona ?? null);
  const filtered = booths.filter((b) => (zone === "all" || b.zone === zone) && `${b.name} ${b.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <TabPage title="부스 탐험" description={readOnly ? undefined : "지도로 찾아보고, 나에게 맞는 체험을 만나봐."} action={readOnly ? <MyPageLink /> : undefined}>
    <section className="hm-card overflow-hidden" aria-label="부스 맵">
      <h2 className="flex items-center gap-2 px-5 pt-5 text-lg font-extrabold text-hm-blue"><Map size={20} />부스 맵</h2>
      {mapFailed ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-hm-blue"><Map size={36} className="text-hm-pattern" /><p className="text-sm font-bold">지도를 준비하고 있어</p><p className="text-xs text-hm-blue/60">아래 목록에서 체험할 부스를 먼저 찾아봐.</p></div> : <div className="relative aspect-[4/3] w-full"><Image src="/booth-map.webp" alt="나Be한마당 부스 배치도" fill sizes="(min-width: 672px) 632px, 100vw" className="object-contain p-3" onError={() => setMapFailed(true)} /></div>}
    </section>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-extrabold text-hm-blue">{readOnly ? (profile.display_name ? `${profile.display_name}님을 위한 부스 추천` : "추천 부스") : "나를 위한 부스 추천"}</h2>
        {recommended.length ? <><p className="text-xs leading-relaxed text-hm-blue/70">{profile.persona?.fields.join(" · ")} · {readOnly ? "페이지 주인의 분야와 관심 키워드에 맞는 부스야." : "내 분야와 관심 키워드에 맞는 부스야."}</p><BoothList booths={recommended} /></> : <div className="hm-card p-5 text-sm leading-relaxed text-hm-blue/70">{!profile.persona ? <>페르소나가 완성되면 관심 분야에 맞는 부스를 추천해줄게. <Link href={`${basePath}/home`} className="font-bold underline">{readOnly ? "페르소나 보기" : "내 카드 보기"}</Link></> : "현재 내 관심 분야와 일치하는 부스가 없어. 전체 목록에서 새로운 관심사를 찾아봐!"}</div>}
      </section>
      <section className="flex flex-col gap-3"><h2 className="text-xl font-extrabold text-hm-blue">전체 부스 <span className="text-sm text-hm-blue/50">{booths.length}</span></h2>
        <label className="flex items-center gap-2 rounded-2xl border border-hm-pattern bg-white px-4 py-3 text-hm-blue"><Search size={18} /><input aria-label="부스 이름 또는 체험 검색" placeholder="어떤 체험을 찾고 있어?" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hm-blue/45" /></label>
        <div className="flex flex-wrap gap-2" aria-label="부스 구역 필터">{(["all", "F", "L", "Y", "C"] as const).map((value) => <button key={value} aria-pressed={zone === value} onClick={() => setZone(value)} className={`rounded-full px-4 py-2 text-xs font-bold ${zone === value ? "bg-hm-blue text-white" : "bg-white text-hm-blue"}`}>{value === "all" ? "전체" : ZONE_SHORT[value]}</button>)}</div>
        {filtered.length ? <BoothList booths={filtered} /> : <p className="hm-card p-6 text-center text-sm text-hm-blue/70">{booths.length ? "검색 조건에 맞는 부스가 없어." : "등록된 부스가 아직 없어."}</p>}
      </section>
    </>}
  </TabPage>;
}
