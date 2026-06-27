"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminToken } from "@/lib/adminAuth";

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
    let cancelled = false;
    if (isLoginPage) {
      Promise.resolve().then(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    Promise.resolve().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoginPage, router]);

  if (!ready) return null;
  return <>{children}</>;
}
