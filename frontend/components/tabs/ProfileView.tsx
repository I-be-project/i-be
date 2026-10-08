"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const token = useSessionStore((s) => s.studentToken);
  const studentId = useSessionStore((s) => s.studentId);
  // 공유 코드의 첫 부분은 계정 UUID다. 로그인한 본인의 QR/링크로 들어오면 자기 홈으로 보낸다.
  const isOwnPage = !!token && !!studentId && code.toLowerCase().startsWith(`${studentId.replaceAll("-", "").toLowerCase()}.`);
  useEffect(() => {
    if (isOwnPage) router.replace("/home");
  }, [isOwnPage, router]);
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
  if (isOwnPage) return null;
  return <ProfileViewContext.Provider value={{
    profile, loading, error, readOnly: true, basePath: `/p/${code}`,
    retry: () => { updatedAt.current = 0; setLoading(true); setError(null); setAttempt((n) => n + 1); },
  }}>{children}</ProfileViewContext.Provider>;
}

export function MyPageLink() {
  const token = useSessionStore((s) => s.studentToken);
  const hydrated = useSessionStore((s) => s.hasHydrated);
  // 본인 공유 화면은 PublicProfileProvider가 /home으로 보내므로 여기선 따로 거르지 않는다.
  if (!hydrated) return null;
  return <Link href={token ? "/home" : "/login?next=%2Fhome"} className="shrink-0 whitespace-nowrap rounded-full border border-hm-pattern bg-white px-3 py-2 text-xs font-extrabold text-hm-blue">내 페이지</Link>;
}
