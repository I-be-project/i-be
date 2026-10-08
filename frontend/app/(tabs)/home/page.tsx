"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { CardActions } from "@/components/tabs/CardActions";
import { FlippablePersonaCard } from "@/components/tabs/FlippablePersonaCard";
import { SOFT_CARD } from "@/components/tabs/BoothList";
import { competencyLabel } from "@/lib/competencies";

// 역량 키워드 해시태그 색 — 순서대로 블루·코랄·틸.
const KEYWORD_COLORS = ["text-hm-blue", "text-hm-coral", "text-hm-teal"];

export default function HomePage() {
  const { profile, readOnly, ...feedback } = useProfileView();
  return <TabPage action={readOnly ? <MyPageLink /> : undefined}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <section aria-label="페르소나 카드" className={`${SOFT_CARD} overflow-hidden p-4 sm:p-5`}>
        <FlippablePersonaCard enabled={!!(profile.card?.card_image_url || profile.persona)} footer={
          !!profile.persona?.keywords.length && <p className="mt-2 flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-base font-extrabold" aria-label="나의 역량 키워드">
            {profile.persona.keywords.map((keyword, i) => <span key={keyword} className={KEYWORD_COLORS[i % KEYWORD_COLORS.length]}>#{competencyLabel(keyword)}</span>)}
          </p>
        }>
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
        </FlippablePersonaCard>
      </section>
      {/* 저장·공유는 카드 박스 밖, 바로 아래에 둔다. */}
      {!readOnly && <CardActions imageUrl={profile.card?.card_image_url} sharePath={profile.share_path} name={profile.student?.name} />}
    </>}
  </TabPage>;
}
