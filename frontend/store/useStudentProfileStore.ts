import { create } from "zustand";
import { ApiError, getMyProfile, type ProfileSummary } from "@/lib/api";
import { useSessionStore } from "./useSessionStore";

export const PROFILE_CACHE_TTL = 5 * 60 * 1000;

interface ProfileCache {
  token: string | null;
  profile: ProfileSummary | null;
  error: string | null;
  unauthorized: boolean;
  fetching: boolean;
  updatedAt: number;
}

const emptyCache: ProfileCache = {
  token: null,
  profile: null,
  error: null,
  unauthorized: false,
  fetching: false,
  updatedAt: 0,
};

// 메모리에만 저장한다. 새로고침하면 비워지고 탭 화면이 교체돼도 유지된다.
export const useStudentProfileStore = create<ProfileCache>(() => ({ ...emptyCache }));
let revision = 0;
let pending: Promise<void> | null = null;

export function clearStudentProfileCache() {
  revision += 1;
  pending = null;
  useStudentProfileStore.setState({ ...emptyCache });
}

useSessionStore.subscribe((state, previous) => {
  if (state.studentToken !== previous.studentToken || state.studentId !== previous.studentId) {
    clearStudentProfileCache();
  }
});

export function loadStudentProfile(token: string, force = false): Promise<void> {
  if (useSessionStore.getState().studentToken !== token) return Promise.resolve();
  const cache = useStudentProfileStore.getState();
  if (cache.token !== token) clearStudentProfileCache();
  else {
    if (pending && !force) return pending;
    if (!force && cache.profile && Date.now() - cache.updatedAt < PROFILE_CACHE_TTL) {
      return Promise.resolve();
    }
  }

  const requestRevision = ++revision;
  useStudentProfileStore.setState({ token, fetching: true, error: null, unauthorized: false, updatedAt: 0 });
  const request = getMyProfile(token).then((profile) => {
    if (requestRevision !== revision) return;
    useStudentProfileStore.setState({ profile, updatedAt: Date.now() });
  }).catch((error: unknown) => {
    if (requestRevision !== revision) return;
    const unauthorized = error instanceof ApiError && error.status === 401;
    useStudentProfileStore.setState({
      error: error instanceof Error ? error.message : "정보를 불러오지 못했어.",
      unauthorized,
      ...(unauthorized ? { profile: null, updatedAt: 0 } : {}),
    });
  }).finally(() => {
    if (requestRevision !== revision) return;
    pending = null;
    useStudentProfileStore.setState({ fetching: false });
  });
  pending = request;
  return request;
}

// 방문 인증 직후 갱신한다. 인증 이전에 시작한 응답은 revision으로 무시한다.
export function refreshStudentProfile(token: string) {
  return loadStudentProfile(token, true);
}
