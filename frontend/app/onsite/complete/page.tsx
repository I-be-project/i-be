"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { ApiError, getOnsitePhoto, startOnsitePhoto, type OnsitePhotoResult } from "@/lib/api";
import { resumePath, useBlockBack } from "@/lib/explore/flow";
import { useSessionStore } from "@/store/useSessionStore";
import "@/store/useStudentProfileStore";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { FlowLoading } from "@/components/voyage/FlowLoading";

export default function OnsiteCompletePage() {
  const router = useRouter();
  const hydrated = useSessionStore((s) => s.hasHydrated);
  const token = useSessionStore((s) => s.studentToken);
  const onsite = useSessionStore((s) => s.onsiteMode);
  const completed = useSessionStore((s) => s.surveyCompleted);
  const hasPhoto = useSessionStore((s) => s.hasPhoto);
  const [photo, setPhoto] = useState<OnsitePhotoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [startingNext, setStartingNext] = useState(false);
  useBlockBack();

  useEffect(() => {
    if (!hydrated || startingNext) return;
    if (!token) { router.replace(onsite ? "/onsite" : "/"); return; }
    if (!onsite || !completed || !hasPhoto) router.replace(resumePath(useSessionStore.getState()));
  }, [hydrated, token, onsite, completed, hasPhoto, router, startingNext]);

  // 카드 합성을 기다리지 않고 사진 생성이 끝나는 즉시 표시한다.
  useEffect(() => {
    if (startingNext || !hydrated || !token || !onsite || !completed || !hasPhoto) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (start = false) => {
      try {
        const result = start ? await startOnsitePhoto(token) : await getOnsitePhoto(token);
        if (!active || useSessionStore.getState().studentToken !== token) return;
        setPhoto(result);
        setLoadFailed(false);
        setError(null);
        if (result.status === "pending" || result.status === "processing") {
          timer = setTimeout(() => void poll(), 2000);
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) { router.replace("/login"); return; }
        if (process.env.NODE_ENV !== "production") {
          console.error("현장 사진 조회 실패", e instanceof ApiError ? { status: e.status, code: e.code } : { name: e instanceof Error ? e.name : "unknown" });
        }
        setLoadFailed(true);
        setError("사진을 불러오지 못했어. 사진 다시 불러오기를 눌러 줘.");
      }
    };
    void poll(retry === 0);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [hydrated, token, onsite, completed, hasPhoto, retry, router, startingNext]);

  const nextParticipant = () => {
    if (startingNext) return;
    setStartingNext(true);
    useSessionStore.getState().reset();
    router.replace("/onsite");
  };

  if (startingNext) return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 font-sans">
      <VoyageBackground variant="soft" />
      <div role="status" aria-live="polite" className="relative z-10 flex flex-col items-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/80 text-sky-600">
          <Sparkles aria-hidden="true" className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-ink">다음 참여자를 맞이하고 있어요</h1>
        <p className="text-sm text-ink-soft">새로운 탐험을 곧 시작할게요.</p>
      </div>
    </main>
  );
  if (!hydrated || !token || !onsite || !completed || !hasPhoto) return <FlowLoading mood="night" />;
  const unavailable = photo?.status === "failed" || photo?.status === "refused";
  const imageUrl = photo?.status === "ready" ? photo.image_url : null;
  const showFallback = unavailable || imageFailed || (!imageUrl && (loadFailed || photo?.status === "ready"));
  const displayImageUrl = showFallback ? "/card-fallback.webp" : imageUrl;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden px-6 pb-10 pt-10 font-sans">
      <VoyageBackground variant="soft" />
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <h1 className="mb-8 text-center text-[2rem] font-black leading-tight tracking-tight text-ink md:text-4xl">탐험을 마쳤어요!</h1>
        <section aria-label="미래의 나의 모습" className="grid overflow-hidden rounded-3xl bg-white md:grid-cols-[0.85fr_1.4fr]">
          <figure className="flex min-w-0 flex-col items-center justify-center gap-4 border-b-2 border-dashed border-sky-200 bg-sky-100 p-6 md:border-b-0 md:border-r-2">
          {displayImageUrl ? (
            <Image key={displayImageUrl} src={displayImageUrl} alt={showFallback ? "유성이 사진" : "AI가 그린 미래의 나의 모습"}
              width={640} height={800} unoptimized onError={showFallback ? undefined : () => setImageFailed(true)}
              className="max-h-[48dvh] w-auto max-w-full rounded-xl object-contain" />
          ) : (
            <div role="status" className="flex aspect-[4/5] w-full max-w-48 flex-col items-center justify-center gap-4 rounded-xl bg-white/60 p-4 text-center text-sm text-ink-soft">
              {!imageFailed && !loadFailed && !unavailable && <LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-sky-600" />}
              <p>{imageFailed || loadFailed ? "사진을 불러오지 못했어." : unavailable ? "AI 사진을 만들지 못했어." : "미래의 모습을 만들고 있어. 준비되면 보여줄게."}</p>
            </div>
          )}
          </figure>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <h2 className="mb-4 text-[1.75rem] font-bold leading-snug tracking-tight text-ink">
              {showFallback ? <>유성이 사진으로<br />대신 보여드려요.</> : imageUrl ? <>새로운 나의 모습이<br />준비됐어요.</> : <>미래의 나의 모습을<br />준비하고 있어요.</>}
            </h2>
            <p className="text-sm leading-relaxed text-ink-soft">오늘 발견한 가능성을<br />한 장의 카드로 간직해 봐.</p>
            <div className="mt-6 rounded-2xl bg-sky-50 p-4">
              <p className="text-sm font-bold leading-relaxed text-ink">실물 카드는 운영진에게 받을 수 있어요.</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">사진이 제대로 생성되지 않았다면 운영진에게 문의해 주세요.</p>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
            {(loadFailed || imageFailed) && <button type="button" onClick={() => { setImageFailed(false); setRetry((v) => v + 1); }} className="mt-4 min-h-11 self-start text-sm font-bold text-sky-700 underline">사진 다시 불러오기</button>}
          </div>
        </section>
        <button type="button" onClick={nextParticipant} className="mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-base font-bold text-white transition-colors hover:bg-sky-700">
          다음 참여자 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </main>
  );
}
