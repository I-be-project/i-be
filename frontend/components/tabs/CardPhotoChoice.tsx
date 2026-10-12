"use client";

// 카드 사진 고르기 — AI가 그린 사진과 캐릭터 중에서 학생이 고른다. 언제든 다시 바꿀 수 있다.
// 카드는 서버에서 다시 합성되고, 공개 페이지에도 같은 카드가 보인다.

import { useState } from "react";
import { chooseCardPhoto, ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";
import { setStudentProfile } from "@/store/useStudentProfileStore";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "ai", label: "AI 사진" },
  { value: "character", label: "캐릭터" },
] as const;

export function CardPhotoChoice({ choice }: { choice: "ai" | "character" }) {
  const token = useSessionStore((s) => s.studentToken);
  const [saving, setSaving] = useState<"ai" | "character" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (value: "ai" | "character") => {
    if (!token || saving || value === choice) return;
    setSaving(value);
    setError(null);
    try {
      setStudentProfile(await chooseCardPhoto(token, value));
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "바꾸지 못했어. 잠시 후 다시 눌러 줘.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-label="카드 사진 고르기" className="mt-3 flex flex-col items-center">
      <div role="radiogroup" className="grid w-60 grid-cols-2 gap-1 rounded-full bg-hm-tint p-1">
        {OPTIONS.map(({ value, label }) => {
          const on = (saving ?? choice) === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              disabled={!!saving}
              onClick={() => pick(value)}
              className={cn(
                "h-9 rounded-full text-[13px] font-extrabold transition",
                on ? "bg-hm-blue text-white shadow-sm" : "text-hm-blue/60 hover:text-hm-blue",
              )}
            >
              {saving === value ? "바꾸는 중..." : label}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-center text-xs font-bold text-hm-coral">{error}</p>}
    </section>
  );
}
