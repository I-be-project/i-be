"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CtaButton } from "@/components/voyage/CtaButton";

export function CompletionEditDialog({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[2rem] border border-white/80 bg-gradient-to-b from-sky-50 to-white px-6 pb-7 pt-9 text-center text-ink shadow-[0_24px_80px_rgba(37,99,235,0.18)] sm:max-w-md sm:px-8">
        <p className="mb-2 text-xs font-bold tracking-wide text-sky-600">공개 전에 한 번 더</p>
        <DialogTitle className="text-[26px] font-black leading-tight tracking-tight">사진을 바꾸고 싶어?</DialogTitle>
        <DialogDescription className="mt-4 break-keep text-[15px] font-medium leading-relaxed text-ink-soft">
          대원증에 들어갈 사진을 수정할 수 있어.
        </DialogDescription>
        <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-xs font-medium leading-relaxed text-ink-muted">
          얼굴이 잘 보이는 사진을 올려 줘.
          <br />얼굴을 확인하기 어려운 사진은 미래의 내 모습을 만들 수 없어.
        </p>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setOpen(false)}
            className="flex h-14 items-center justify-center rounded-full border border-sky-200 bg-white px-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50 active:scale-[0.98]">
            그대로 기다리기
          </button>
          <CtaButton onClick={() => preview ? setError("미리보기야. 실제 화면에서는 사진 수정 화면으로 이동해.") : router.push("/explore/photo/edit")}
            className="w-full gap-1.5 px-2 text-sm">
            사진 수정
          </CtaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
