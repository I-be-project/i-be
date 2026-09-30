"use client";

import Link from "next/link";
import { User, ArrowUpRight } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { BoothList, VisitSummary } from "@/components/tabs/BoothList";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";

export default function HomePage() {
  const { profile, readOnly, basePath, ...feedback } = useProfileView();
  const visited = (profile?.booths ?? []).filter((b) => b.visited).sort((a, b) => (b.visited_at ?? "").localeCompare(a.visited_at ?? ""));
  return <TabPage title={readOnly ? "공유된 한마당" : "나의 한마당"} action={readOnly ? <MyPageLink /> : undefined}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <section aria-label="페르소나 카드" className="hm-card overflow-hidden p-4 sm:p-5">
        <p className="mb-4 text-xs font-extrabold tracking-wide text-hm-blue/60">{readOnly ? "PERSONA · 페르소나" : "MY PERSONA · 나의 페르소나"}</p>
        {profile.card?.card_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.card.card_image_url} alt={`${readOnly ? "페이지 주인" : profile.student?.name ?? "나"}의 페르소나 카드`} className="h-auto w-full rounded-xl" />
        ) : profile.persona ? <div className="flex items-center gap-4">
          <div className="aspect-[3/4] w-[32%] shrink-0 overflow-hidden rounded-xl bg-hm-tint">
            {profile.student?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.student.photo_url} alt="내 사진" className="h-full w-full object-cover" />
            ) : <User className="h-full w-full p-6 text-hm-pattern" />}
          </div>
          <div className="min-w-0"><p className="text-xs text-hm-blue/60">{profile.student?.school || "나Be한마당 탐험대원"}</p><p className="mt-1 font-bold text-hm-blue">{profile.student?.name}</p><h2 className="mt-3 break-keep text-xl font-extrabold text-hm-blue">{profile.persona.name}</h2><p className="mt-2 text-xs leading-relaxed text-hm-blue/70">{profile.persona.tagline}</p></div>
        </div> : <div className="py-6 text-center"><h2 className="text-lg font-extrabold text-hm-blue">{(readOnly || profile.has_completed) ? "페르소나 카드를 준비하고 있어" : "나만의 페르소나를 만나볼까?"}</h2><p className="mt-2 text-sm text-hm-blue/65">{(readOnly || profile.has_completed) ? "완성되면 여기에 표시될 거야." : "탐험을 마치면 이곳에 내 카드가 생겨."}</p>{!readOnly && !profile.has_completed && <Link href="/explore" className="mt-4 inline-block rounded-full bg-hm-blue px-5 py-2 text-sm font-bold text-white">탐험하러 가기</Link>}</div>}
        {!!profile.persona?.fields.length && <div className="mt-4 flex flex-wrap gap-2 border-t border-hm-pattern pt-3">{profile.persona.fields.map((field) => <span key={field} className="rounded-full bg-hm-tint px-3 py-1 text-xs font-bold text-hm-blue">{field}</span>)}</div>}
      </section>
      <section className="mt-3 flex flex-col gap-4">
        <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-hm-blue">{readOnly ? "참여 기록" : "나의 참여 기록"}</h2><Link href={`${basePath}/growth`} className="flex items-center gap-1 text-xs font-bold text-hm-blue">성장 보기<ArrowUpRight size={15} /></Link></div>
        <VisitSummary booths={visited} />
        {visited.length ? <BoothList booths={visited} showDate /> : <div className="hm-card p-6 text-center text-sm text-hm-blue/70"><p>아직 참여한 부스가 없어.</p><Link href={`${basePath}/booths`} className="mt-3 inline-block font-extrabold text-hm-blue">첫 부스 찾아보기 →</Link></div>}
      </section>
    </>}
  </TabPage>;
}
