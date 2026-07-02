"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 학생 여정 공통 CTA — 웰컴 화면의 필(pill) 버튼과 동일한 언어.
// 모바일 엄지 존 기준 h-14, 전체 폭. 색·그림자를 여기서만 관리해 화면 간 표류를 막는다.
export function CtaButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className={cn(
        "h-14 w-full rounded-full border border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-base font-bold text-white shadow-[0_10px_26px_rgba(37,99,235,0.35)] transition-all hover:shadow-[0_14px_34px_rgba(37,99,235,0.45)] active:scale-[0.98] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
