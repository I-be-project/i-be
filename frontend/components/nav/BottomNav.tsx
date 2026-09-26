"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, Home, MapPin } from "lucide-react";

interface TabDef {
  href: string;
  label: string;
  icon: typeof Home;
  // 하위 스캔 화면에서도 성장 탭을 활성화한다.
  isActive: (pathname: string) => boolean;
}

// 하단 탭 3개 — 설문 완료 후 진입하는 (tabs) 그룹 전용.
export function BottomNav({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();

  const tabs: TabDef[] = [
    { href: `${basePath}/booths`, label: "부스", icon: MapPin, isActive: (p) => p === `${basePath}/booths` },
    { href: `${basePath}/home`, label: "홈", icon: Home, isActive: (p) => p === `${basePath}/home` },
    { href: `${basePath}/growth`, label: "성장", icon: Sprout, isActive: (p) => p.startsWith(`${basePath}/growth`) },
  ];

  return (
    // 프레임 폭(max-w-2xl)에 맞춰 가운데 정렬되는 fixed 바 — path/page.tsx 하단 CTA와 동일 패턴.
    // transform 조상 없이 여기 직속으로 둬야 fixed가 뷰포트 기준으로 고정된다.
    <nav
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 border-t-2 border-solid border-hm-pattern bg-hm-tint/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
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
                (active ? "bg-hm-blue/10 text-hm-blue" : "text-hm-blue/45 hover:text-hm-blue/70")
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
