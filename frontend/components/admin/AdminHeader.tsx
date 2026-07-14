"use client";

import { LayoutGrid, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearAdminToken } from "@/lib/adminAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "회원 목록", icon: Users },
  { href: "/admin/seating", label: "진행 현황", icon: LayoutGrid },
];

/** 관리자 화면 공통 상단 바 — 브랜드 마크 + 페이지 내비 + 로그아웃. */
export function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();

  function logout() {
    clearAdminToken();
    router.replace("/admin/login");
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
              <p className="text-sm font-semibold tracking-tight">관리자 콘솔</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
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
