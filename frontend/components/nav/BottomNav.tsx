"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, MapPin, User } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";

interface TabDef {
  href: string;
  label: string;
  icon: typeof Home;
  // 활성 여부 판단 — 프로필 탭은 동적 id(/profile/[id])라 prefix로 비교한다.
  isActive: (pathname: string) => boolean;
}

// 하단 탭 4개 — 설문 완료 후 진입하는 (tabs) 그룹 전용.
export function BottomNav() {
  const pathname = usePathname();
  const studentId = useSessionStore((s) => s.studentId);

  const tabs: TabDef[] = [
    { href: "/home", label: "홈", icon: Home, isActive: (p) => p === "/home" },
    { href: "/booths", label: "부스", icon: MapPin, isActive: (p) => p === "/booths" },
    {
      href: "/tendency",
      label: "자신의 성향",
      icon: Compass,
      isActive: (p) => p === "/tendency",
    },
    {
      href: studentId ? `/profile/${studentId}` : "/login",
      label: "프로필",
      icon: User,
      isActive: (p) => p.startsWith("/profile/"),
    },
  ];

  return (
    // 프레임 폭(max-w-2xl)에 맞춰 가운데 정렬되는 fixed 바 — path/page.tsx 하단 CTA와 동일 패턴.
    // transform 조상 없이 여기 직속으로 둬야 fixed가 뷰포트 기준으로 고정된다.
    <nav
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 border-t border-solid border-white/70 bg-white/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
      aria-label="하단 탭 메뉴"
    >
      <div className="flex items-center justify-around px-2">
        {tabs.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold transition-colors " +
                (active ? "text-sky-600" : "text-ink-muted hover:text-ink-soft")
              }
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={active ? 2.4 : 2}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
