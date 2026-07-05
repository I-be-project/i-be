"use client";

import { usePathname } from "next/navigation";

// 앱 프레임 — 맨 처음(웰컴) 화면만 전체 화면(full-bleed)으로 두고,
// 나머지 학생 여정 화면은 질문 화면과 동일한 고정 폭(max-w-2xl) 컬럼으로 가운데 정렬한다.
// 넓은 화면(데스크톱/태블릿)에서 콘텐츠가 좌우로 퍼지지 않고 항상 같은 크기로 보인다.
// 웰컴(/)은 전체 화면 유지, 운영자/개발 도구(admin·dev)는 자체 넓은 레이아웃이라 프레임 제외.
const FULL_BLEED_ROUTES = new Set(["/"]);
const UNFRAMED_PREFIXES = ["/admin", "/dev"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isUnframed =
    FULL_BLEED_ROUTES.has(pathname) ||
    UNFRAMED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (isUnframed) {
    return <>{children}</>;
  }

  // 프레임 바깥 여백(gutter)은 흰색이 아니라 앱 하늘 테마색(#c9e5fa)으로 채운다.
  // 웰컴(full-bleed) 화면은 위에서 이미 반환했으므로 영향 없음.
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#c9e5fa]">
      <div className="flex min-h-[100dvh] w-full max-w-2xl flex-col">
        {children}
      </div>
    </div>
  );
}
