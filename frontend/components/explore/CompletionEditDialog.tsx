"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, RotateCcw, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CtaButton } from "@/components/voyage/CtaButton";
import { ApiError, restartSurvey } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

export function CompletionEditDialog({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const restart = async () => {
    if (preview) {
      setError("미리보기야. 실제 화면에서는 설문을 처음부터 다시 시작해.");
      return;
    }
    const store = useSessionStore.getState();
    if (starting || !store.studentToken) return;
    setStarting(true);
    setError(null);
    try {
      await restartSurvey(store.studentToken);
      store.restartSurvey();
      router.replace("/explore");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError("설문을 시작하지 못했어. 잠시 후 다시 눌러 줘.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (starting) return;
      if (!next && confirming) { setConfirming(false); setError(null); }
      else setOpen(next);
    }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[2rem] border border-white/80 bg-gradient-to-b from-sky-50 to-white px-6 pb-7 pt-9 text-center text-ink shadow-[0_24px_80px_rgba(37,99,235,0.18)] sm:max-w-md sm:px-8">
        <DialogClose aria-label="팝업 나가기" disabled={starting} className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50">
          <X className="size-5" />
        </DialogClose>
        {confirming ? (
          <>
            <p className="mb-2 text-xs font-bold tracking-wide text-sky-600">다시 시작하기 전에</p>
            <DialogTitle className="px-3 text-[26px] font-black leading-tight tracking-tight">정말 설문을 다시 할까?</DialogTitle>
            <DialogDescription className="mt-4 break-keep text-[15px] font-medium leading-relaxed text-ink-soft">
              다시 시작하면 이전 설문 답변과 결과가 삭제되고, 처음부터 설문에 참여하게 돼.
            </DialogDescription>
            <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-800">
              삭제된 결과는 되돌릴 수 없어.<br />등록한 사진은 그대로 유지돼.
            </p>
            {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" disabled={starting} onClick={() => { setConfirming(false); setError(null); }}
                className="h-14 rounded-full border border-sky-200 bg-white px-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50">취소</button>
              <CtaButton onClick={restart} disabled={starting} className="px-2 text-sm">{starting ? "시작하는 중..." : "삭제하고 다시 하기"}</CtaButton>
            </div>
          </>
        ) : (
          <>
        <p className="mb-2 text-xs font-bold tracking-wide text-sky-600">공개 전에 한 번 더</p>
        <DialogTitle className="text-[26px] font-black leading-tight tracking-tight">바꾸고 싶은 게 있어?</DialogTitle>
        <DialogDescription className="mt-4 break-keep text-[15px] font-medium leading-relaxed text-ink-soft">
          설문을 다시 하거나 대원증에 들어갈 사진을 수정할 수 있어.
          <br />그대로 기다리고 싶다면 오른쪽 위 X를 눌러 줘.
        </DialogDescription>
        <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-xs font-medium leading-relaxed text-ink-muted">
          설문은 처음부터 다시 시작하고, 등록한 사진은 유지돼.
          <br />사진만 바꾸면 설문 답변은 그대로야.
        </p>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => { setError(null); setConfirming(true); }} disabled={starting}
            className="flex h-14 items-center justify-center gap-1.5 rounded-full border border-sky-200 bg-white px-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50 active:scale-[0.98] disabled:opacity-50">
            <RotateCcw className="size-4" />{starting ? "확인 중..." : "설문 다시 하기"}
          </button>
          <CtaButton disabled={starting} onClick={() => preview ? setError("미리보기야. 실제 화면에서는 사진 수정 화면으로 이동해.") : router.push("/explore/photo/edit")}
            className="gap-1.5 px-2 text-sm">
            <Camera className="size-4" />사진 수정
          </CtaButton>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
