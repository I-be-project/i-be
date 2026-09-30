"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { BottomNav } from "@/components/nav/BottomNav";
import { OwnProfileProvider } from "@/components/tabs/ProfileView";

// 설문 완료 후 진입하는 3탭(부스/홈/성장) 공용 레이아웃.
// route group이라 URL(/booths, /home, /growth)엔 안 드러난다.
// 탭을 오가도 이 레이아웃은 리마운트되지 않으므로(템플릿과 달리) 하단 네비가 유지된다.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);

  // 인증가드 — 기존 profile/[id]/page.tsx에 있던 로직을 그대로 옮겼다.
  // hasHydrated 전에는 localStorage 복원 중이므로 판단을 보류한다.
  useEffect(() => {
    if (hasHydrated && !studentToken) router.replace("/login");
  }, [hasHydrated, studentToken, router]);

  if (!hasHydrated || !studentToken) return <FlowLoading />;

  // 각 탭 페이지가 스스로 min-h-[100dvh]를 갖고, 문서가 자연스럽게 스크롤되는 방식
  // (explore/path.tsx의 고정 하단 CTA와 동일 패턴). 여기서 별도 h-[100dvh]/overflow
  // 스크롤 컨테이너를 만들면 AppFrame의 min-h-[100dvh]와 중첩되며 fixed 하단바 아래에
  // 틈이 뜨고, 스크롤 영역이 이중으로 생기는 문제가 있어 이 구조로 단순화했다.
  return (
    <OwnProfileProvider>
      {children}
      {pathname !== "/growth/scan" && <div className="pointer-events-none fixed bottom-24 left-1/2 z-30 flex w-full max-w-2xl -translate-x-1/2 justify-end px-5">
        <Link href="/growth/scan" aria-label="QR 스캔" className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-hm-blue text-white shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hm-blue"><Camera size={28} /></Link>
      </div>}
      <BottomNav />
    </OwnProfileProvider>
  );
}
