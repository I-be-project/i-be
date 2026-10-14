"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSessionStore } from "@/store/useSessionStore";

// 내 홈 왼쪽 위 로그아웃 — 누르면 확인 팝업을 띄우고, 확인 시 세션을 지우고 로그인 화면으로 간다.
export function LogoutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const logout = () => {
    useSessionStore.getState().reset(); // 프로필 캐시는 토큰 변경 구독에서 함께 비워진다.
    router.replace("/login");
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-hm-pattern bg-white px-3 py-2 text-xs font-extrabold text-hm-blue">
      <LogOut className="size-3.5" />로그아웃
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-w-xs bg-white p-6 text-center">
        <DialogTitle className="text-lg font-black text-hm-blue">로그아웃할까?</DialogTitle>
        <DialogDescription className="text-sm text-hm-blue/70">다시 들어오려면 로그인해야 해.</DialogDescription>
        <div className="mt-2 flex gap-2">
          <DialogClose className="flex-1 rounded-full border border-hm-pattern py-2.5 text-sm font-bold text-hm-blue">취소</DialogClose>
          <button type="button" onClick={logout} className="flex-1 rounded-full bg-hm-blue py-2.5 text-sm font-bold text-white">로그아웃</button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
