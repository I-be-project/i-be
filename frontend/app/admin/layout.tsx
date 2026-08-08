"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ADMIN_CONSOLE,
  ConsoleProvider,
} from "@/components/console/ConsoleProvider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      // 토큰은 localStorage에만 있어 마운트 후에만 인증 여부를 알 수 있다.
      // 이 effect 내 setState는 의도된 것 — 규칙을 해당 라인에서만 끈다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    if (!ADMIN_CONSOLE.getToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  if (!ready) return null;
  return <ConsoleProvider value={ADMIN_CONSOLE}>{children}</ConsoleProvider>;
}
