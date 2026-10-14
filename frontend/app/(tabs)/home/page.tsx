"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { LogoutButton } from "@/components/tabs/LogoutButton";
import { CardActions } from "@/components/tabs/CardActions";
import { CardPhotoChoiceDialog } from "@/components/tabs/CardPhotoChoiceDialog";
import { FlippablePersonaCard } from "@/components/tabs/FlippablePersonaCard";
import { useNabiImage } from "@/hooks/useNabiImage";
import { SOFT_CARD } from "@/components/tabs/BoothList";
import { competencyLabel } from "@/lib/competencies";

// 역량 키워드 해시태그 색 — 순서대로 블루·코랄·틸.
const KEYWORD_COLORS = ["text-hm-blue", "text-hm-coral", "text-hm-teal"];

export default function HomePage() {
  const { profile, readOnly, basePath, ...feedback } = useProfileView();
  // 카드 이미지까지 나와야 카드를 보여준다(페르소나만 있는 간이 카드는 띄우지 않음).
  const cardEnabled = !!profile?.card?.card_image_url;
  // 공개 페이지 basePath는 /p/<code>.
  const nabiImageUrl = useNabiImage(cardEnabled, readOnly ? basePath.split("/")[2] ?? null : null);
  return <TabPage action={readOnly ? <MyPageLink /> : undefined} leading={readOnly ? undefined : <LogoutButton />}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <section aria-label="페르소나 카드" className={`${SOFT_CARD} overflow-hidden p-4 sm:p-5`}>
        <FlippablePersonaCard enabled={cardEnabled} backImageUrl={nabiImageUrl} footer={
          cardEnabled && !!profile.persona?.keywords.length && <p className="mt-2 flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-base font-extrabold" aria-label="나의 역량 키워드">
            {profile.persona.keywords.map((keyword, i) => <span key={keyword} className={KEYWORD_COLORS[i % KEYWORD_COLORS.length]}>#{competencyLabel(keyword)}</span>)}
          </p>
        }>
        {profile.card?.card_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.card.card_image_url} alt={`${readOnly ? "페이지 주인" : profile.student?.name ?? "나"}의 페르소나 카드`} className="h-auto w-full rounded-xl" />
        ) : <div className="py-6 text-center"><h2 className="text-lg font-extrabold text-hm-blue">{(readOnly || profile.has_completed) ? "페르소나 카드를 준비하고 있어" : "나만의 페르소나를 만나볼까?"}</h2><p className="mt-2 text-sm text-hm-blue/65">{(readOnly || profile.has_completed) ? "완성되면 여기에 표시될 거야." : "탐험을 마치면 이곳에 내 카드가 생겨."}</p>{(readOnly || profile.has_completed) && <RefreshCardButton onRefresh={feedback.retry} />}{!readOnly && !profile.has_completed && <Link href="/explore" className="mt-4 inline-block rounded-full bg-hm-blue px-5 py-2 text-sm font-bold text-white">탐험하러 가기</Link>}</div>}
        </FlippablePersonaCard>
      </section>
      {/* 저장·공유는 카드 박스 밖, 바로 아래에 둔다. */}
      {!readOnly && profile.card?.photo_choice_needed && profile.card.ai_photo_url && <CardPhotoChoiceDialog aiPhotoUrl={profile.card.ai_photo_url} />}
      {!readOnly && <CardActions imageUrl={profile.card?.card_image_url} sharePath={profile.share_path} name={profile.student?.name} />}
    </>}
  </TabPage>;
}

// 카드 대기 중 새로고침 — 서버에 카드가 만들어졌는지 다시 묻는다. 결과가 같아도 눌렸다는 걸 보이게 잠깐 돈다.
function RefreshCardButton({ onRefresh }: { onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);
  return <button type="button" disabled={spinning} onClick={() => { onRefresh(); setSpinning(true); setTimeout(() => setSpinning(false), 1000); }} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-hm-pattern bg-white px-4 py-2 text-sm font-bold text-hm-blue disabled:opacity-60">
    <RefreshCw className={`size-4 ${spinning ? "animate-spin" : ""}`} />새로고침
  </button>;
}
