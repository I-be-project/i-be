"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { getPublicProfile, type ProfileSummary } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

interface ProfileViewState {
  profile: ProfileSummary | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  readOnly: boolean;
  basePath: string;
}

const ProfileViewContext = createContext<ProfileViewState | null>(null);

export function useProfileView() {
  const view = useContext(ProfileViewContext);
  if (!view) throw new Error("ProfileView provider is required");
  return view;
}

export function OwnProfileProvider({ children }: { children: ReactNode }) {
  const state = useStudentProfile();
  return <ProfileViewContext.Provider value={{ ...state, readOnly: false, basePath: "" }}>{children}</ProfileViewContext.Provider>;
}

// 공개 페이지는 개인 캐시/인증 토큰과 완전히 분리한다. 공유 코드가 바뀌면 새로 마운트한다.
export function PublicProfileProvider({ code, children }: { code: string; children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const updatedAt = useRef(0);
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || Date.now() - updatedAt.current < 300_000) return;
      pending = true;
      try {
        const data = await getPublicProfile(code);
        if (!active) return;
        setProfile({ ...data, student: null, has_completed: !!data.persona, retry_enabled: false });
        updatedAt.current = Date.now();
        setError(null);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "공유 페이지를 불러오지 못했어.");
          setProfile(null);
        }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [code, attempt]);
  return <ProfileViewContext.Provider value={{
    profile, loading, error, readOnly: true, basePath: `/p/${code}`,
    retry: () => { updatedAt.current = 0; setLoading(true); setError(null); setAttempt((n) => n + 1); },
  }}>{children}</ProfileViewContext.Provider>;
}

export function MyPageLink() {
  const { basePath } = useProfileView();
  const token = useSessionStore((s) => s.studentToken);
  const studentId = useSessionStore((s) => s.studentId);
  const hydrated = useSessionStore((s) => s.hasHydrated);
  // 공유 코드의 첫 부분은 계정 UUID다. 본인 공유 화면에서는 복귀 버튼을 숨긴다.
  const isOwnPage = !!token && !!studentId && basePath.startsWith(`/p/${studentId.replaceAll("-", "").toLowerCase()}.`);
  if (!hydrated || isOwnPage) return null;
  return <Link href={hydrated && token ? "/home" : "/login?next=%2Fhome"} className="shrink-0 rounded-full border border-hm-pattern bg-white px-4 py-2 text-xs font-extrabold text-hm-blue">내 페이지로 가기</Link>;
}
