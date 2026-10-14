import { create } from "zustand";
import { ApiError, getMyProfile, type ProfileSummary } from "@/lib/api";
import { useSessionStore } from "./useSessionStore";

export const PROFILE_CACHE_TTL = 5 * 60 * 1000;
// 새로고침·앱 복귀 재로드에도 살아남게 sessionStorage에도 복사해 둔다(탭을 닫으면 사라진다).
const STORAGE_KEY = "hm.profile";

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

// 메모리가 기준이고 탭 화면이 교체돼도 유지된다. 새로고침으로 비면 sessionStorage 저장본에서 되살린다.
export const useStudentProfileStore = create<ProfileCache>(() => ({ ...emptyCache }));
let revision = 0;
let pending: Promise<void> | null = null;

interface Stored { token: string; profile: ProfileSummary; updatedAt: number }

// 설문은 끝났는데 카드 이미지가 아직이면(생성 대기) 캐시를 믿지 않고 매번 다시 묻는다.
// 그래야 새로고침·홈 탭 클릭·주기 갱신 때 카드가 나오자마자 바뀐다.
function isFresh(profile: ProfileSummary | null, updatedAt: number): boolean {
  if (!profile || Date.now() - updatedAt >= PROFILE_CACHE_TTL) return false;
  return !(profile.has_completed && !profile.card?.card_image_url);
}

function readStored(token: string): Stored | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
    if (!stored || stored.token !== token || !isFresh(stored.profile, stored.updatedAt)) return null;
    return stored;
  } catch {
    return null; // 저장소를 못 쓰는 환경(SSR·프라이빗 모드) — 메모리 캐시만 쓴다
  }
}

function writeStored(stored: Stored) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* readStored와 같은 이유 */ }
}

function removeStored() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* readStored와 같은 이유 */ }
}

export function clearStudentProfileCache() {
  revision += 1;
  pending = null;
  useStudentProfileStore.setState({ ...emptyCache });
}

useSessionStore.subscribe((state, previous) => {
  if (state.studentToken !== previous.studentToken || state.studentId !== previous.studentId) {
    clearStudentProfileCache();
    // 로그아웃·계정 전환이면 저장본도 지운다. 앱 시작 시 localStorage 복원(null → 토큰)은 해당 없음.
    if (previous.studentToken) removeStored();
  }
});

export function loadStudentProfile(token: string, force = false): Promise<void> {
  if (useSessionStore.getState().studentToken !== token) return Promise.resolve();
  const cache = useStudentProfileStore.getState();
  if (cache.token !== token) {
    clearStudentProfileCache();
    // 새로고침으로 메모리가 비었어도 저장본이 유효하면 요청 없이 되살린다.
    const stored = force ? null : readStored(token);
    if (stored) {
      useStudentProfileStore.setState(stored);
      return Promise.resolve();
    }
  } else {
    if (pending && !force) return pending;
    if (!force && isFresh(cache.profile, cache.updatedAt)) {
      return Promise.resolve();
    }
  }

  const requestRevision = ++revision;
  useStudentProfileStore.setState({ token, fetching: true, error: null, unauthorized: false, updatedAt: 0 });
  const request = getMyProfile(token).then((profile) => {
    if (requestRevision !== revision) return;
    const updatedAt = Date.now();
    useStudentProfileStore.setState({ profile, updatedAt });
    writeStored({ token, profile, updatedAt });
  }).catch((error: unknown) => {
    if (requestRevision !== revision) return;
    const unauthorized = error instanceof ApiError && error.status === 401;
    if (unauthorized) removeStored();
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

// 프로필을 돌려주는 변경 API(카드 사진 선택 등)의 응답이나, 랜딩·로그인이 먼저 받아 둔 프로필로
// 바로 갈아끼운다 — 탭 화면에 들어올 때 /me를 또 부르지 않게.
export function setStudentProfile(profile: ProfileSummary, token = useStudentProfileStore.getState().token) {
  // 다른 계정으로 바뀐 뒤 도착한 응답은 버린다.
  if (!token || useSessionStore.getState().studentToken !== token) return;
  revision += 1;
  pending = null;
  const updatedAt = Date.now();
  useStudentProfileStore.setState({ token, profile, updatedAt, fetching: false, error: null, unauthorized: false });
  writeStored({ token, profile, updatedAt });
}

// 방문 인증 직후 갱신한다. 인증 이전에 시작한 응답은 revision으로 무시한다.
export function refreshStudentProfile(token: string) {
  return loadStudentProfile(token, true);
}
