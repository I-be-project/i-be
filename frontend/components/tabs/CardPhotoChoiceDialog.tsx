"use client";

// 카드 사진 선택 시트 — AI가 그린 사진과 캐릭터 중 하나를 고른다. 한 번 고르면 바꿀 수 없다.
// AI 사진이 있고 아직 고르지 않은 학생에게만 홈에서 뜬다(AI 사진이 없으면 캐릭터로 고정).
// 반드시 골라야 하므로 바깥 클릭·ESC로 닫히지 않는다. 모양은 부스 상세 시트(BoothSheet)와 맞춘다.

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, chooseCardPhoto } from "@/lib/api";
import { paperlogy } from "@/lib/fonts";
import { useSessionStore } from "@/store/useSessionStore";
import { setStudentProfile } from "@/store/useStudentProfileStore";
import { cn } from "@/lib/utils";

type Choice = "ai" | "character";

export function CardPhotoChoiceDialog({ aiPhotoUrl }: { aiPhotoUrl: string }) {
  const token = useSessionStore((s) => s.studentToken);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!token || !choice || saving) return;
    setSaving(true);
    setError(null);
    try {
      // 응답 프로필은 photo_choice_needed가 false라 시트가 사라진다.
      setStudentProfile(await chooseCardPhoto(token, choice));
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "저장하지 못했어. 잠시 후 다시 눌러 줘.");
      setSaving(false);
    }
  };

  const options: { value: Choice; label: string }[] = [
    { value: "ai", label: "AI가 그린 내 모습" },
    { value: "character", label: "캐릭터" },
  ];

  return (
    // onOpenChange를 넘기지 않는다 — 고르기 전에는 닫히지 않는다.
    <Sheet open disablePointerDismissal>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // 열자마자 첫 사진에 포커스 테두리가 생겨 이미 고른 것처럼 보이지 않게 한다.
        initialFocus={false}
        className={cn(
          paperlogy.className,
          "mx-auto max-h-[90dvh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-3xl border-0 bg-white px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-hm-blue",
        )}
      >
        <p className="text-sm font-bold text-hm-blue/70">대원증 사진</p>
        <SheetTitle className="mt-1.5 break-keep text-[1.45rem] font-extrabold leading-snug text-hm-blue">
          어떤 모습으로 카드를 만들까?
        </SheetTitle>
        <SheetDescription className="mt-1 text-sm font-bold text-hm-coral">
          한 번 고르면 다시 바꿀 수 없어.
        </SheetDescription>

        <div role="radiogroup" aria-label="카드 사진" className="mt-5 grid grid-cols-2 gap-3">
          {options.map(({ value, label }) => {
            const on = choice === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={saving}
                onClick={() => setChoice(value)}
                className={cn(
                  "group text-center outline-none transition",
                  choice && !on && "opacity-55",
                )}
              >
                <span
                  className={cn(
                    "relative block aspect-[4/5] overflow-hidden rounded-2xl bg-hm-tint transition",
                    on && "ring-[3px] ring-hm-blue ring-offset-2",
                    !on && "group-focus-visible:ring-2 group-focus-visible:ring-hm-blue/40",
                  )}
                >
                  {value === "ai" ? (
                    // S3 서명 URL은 next/image remotePatterns에 없다 — 코드베이스 관례대로 <img>.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={aiPhotoUrl} alt={label} className="h-full w-full object-cover" />
                  ) : (
                    <Image src="/card-fallback.webp" alt={label} fill sizes="45vw" className="object-cover" />
                  )}
                  {on && (
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-hm-blue text-white shadow-md">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cn("mt-2 block text-[0.95rem] text-hm-blue", on ? "font-extrabold" : "font-bold")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p role="alert" className="mt-3 text-center text-sm font-bold text-hm-coral">{error}</p>}

        <button
          type="button"
          onClick={confirm}
          disabled={!choice || saving}
          className="mt-6 w-full rounded-2xl bg-hm-blue py-3.5 text-sm font-extrabold text-white transition disabled:bg-hm-blue/30"
        >
          {saving ? "카드를 만드는 중..." : choice ? "이 모습으로 정하기" : "둘 중 하나를 골라 줘"}
        </button>
      </SheetContent>
    </Sheet>
  );
}
