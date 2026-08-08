"use client";

import {
  BarChart3,
  LayoutGrid,
  LogOut,
  QrCode,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useConsole,
  type ConsoleRole,
} from "@/components/console/ConsoleProvider";
import { cn } from "@/lib/utils";

interface NavItem {
  /** basePath 뒤에 붙는 조각. 빈 문자열이면 basePath 자신. */
  path: string;
  label: string;
  icon: LucideIcon;
}

// 관리자와 운영진의 차이는 부스 화면 이름뿐이다 — 관리자는 편집까지, 운영진은 확인만.
const NAV: Record<ConsoleRole, NavItem[]> = {
  admin: [
    { path: "", label: "회원 목록", icon: Users },
    { path: "/seating", label: "진행 현황", icon: LayoutGrid },
    { path: "/booths", label: "부스 관리", icon: QrCode },
    { path: "/visits", label: "부스별 참여인원", icon: BarChart3 },
  ],
  operator: [
    { path: "", label: "회원 목록", icon: Users },
    { path: "/seating", label: "진행 현황", icon: LayoutGrid },
    { path: "/booths", label: "부스 확인", icon: QrCode },
    { path: "/visits", label: "부스별 참여인원", icon: BarChart3 },
  ],
};

const TITLE: Record<ConsoleRole, string> = {
  admin: "관리자 콘솔",
  operator: "운영진 콘솔",
};

/** 콘솔 공통 상단 바 — 브랜드 마크 + 역할별 내비 + 로그아웃. */
export function ConsoleHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, clearToken, loginPath, basePath } = useConsole();

  function logout() {
    clearToken();
    router.replace(loginPath);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-[var(--chart-2)] text-primary-foreground shadow-sm">
              <Users className="size-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                나Be한마당
              </p>
              <p className="text-sm font-semibold tracking-tight">
                {TITLE[role]}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV[role].map(({ path, label, icon: Icon }) => {
              const href = `${basePath}${path}`;
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
          로그아웃
        </Button>
      </div>
    </header>
  );
}
