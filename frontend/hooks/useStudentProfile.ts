"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/useSessionStore";
import { loadStudentProfile, refreshStudentProfile, useStudentProfileStore } from "@/store/useStudentProfileStore";

export function useStudentProfile() {
  const token = useSessionStore((s) => s.studentToken);
  const router = useRouter();
  const cache = useStudentProfileStore();
  const current = cache.token === token;
  const profile = current ? cache.profile : null;

  useEffect(() => {
    if (!token) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadStudentProfile(token);
    };
    void loadStudentProfile(token);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    if (current && cache.unauthorized) router.replace("/login");
  }, [current, cache.unauthorized, router]);

  return {
    profile,
    // 재조회 중에도 캐시를 표시하고, 최초 조회 때만 로딩 화면을 보여준다.
    loading: !profile && (!current || cache.fetching || !cache.error),
    error: profile ? null : current ? cache.error : null,
    retry: () => { if (token) void refreshStudentProfile(token); },
  };
}
