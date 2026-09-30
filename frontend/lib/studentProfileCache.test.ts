import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getMyProfile, type ProfileSummary } from "./api";
import { useSessionStore } from "@/store/useSessionStore";
import { clearStudentProfileCache, loadStudentProfile, PROFILE_CACHE_TTL, refreshStudentProfile, useStudentProfileStore } from "@/store/useStudentProfileStore";

vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  getMyProfile: vi.fn(),
}));

const profile: ProfileSummary = {
  has_completed: true, retry_enabled: false, student: null, persona: null,
  card: null, booths: [], competencies: [],
};
function deferred() {
  let resolve!: (value: ProfileSummary) => void;
  const promise = new Promise<ProfileSummary>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getMyProfile).mockReset();
  useSessionStore.setState({ studentToken: "student-a", studentId: "a" });
  clearStudentProfileCache();
});

describe("탭 공용 프로필 캐시", () => {
  it("첫 진입과 동시 요청은 한 번만 조회하고 이후 탭 이동은 캐시를 사용한다", async () => {
    const response = deferred();
    vi.mocked(getMyProfile).mockReturnValue(response.promise);
    const first = loadStudentProfile("student-a");
    const nextTab = loadStudentProfile("student-a");
    expect(first).toBe(nextTab);
    response.resolve(profile);
    await first;
    await loadStudentProfile("student-a");
    expect(getMyProfile).toHaveBeenCalledTimes(1);
    expect(useStudentProfileStore.getState().profile).toEqual(profile);
  });

  it("오래된 캐시는 화면에 유지하며 뒤에서 갱신한다", async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce(profile);
    await loadStudentProfile("student-a");
    useStudentProfileStore.setState({ updatedAt: Date.now() - PROFILE_CACHE_TTL - 1 });
    const response = deferred();
    vi.mocked(getMyProfile).mockReturnValueOnce(response.promise);
    const refresh = loadStudentProfile("student-a");
    expect(useStudentProfileStore.getState()).toMatchObject({ profile, fetching: true });
    response.resolve({ ...profile, booths: [{ id: "booth", name: "참여 부스", visited: true }] });
    await refresh;
    expect(useStudentProfileStore.getState().profile?.booths).toHaveLength(1);
  });

  it("QR 인증 후에는 유효 기간 안이어도 새 참여 기록을 받아온다", async () => {
    vi.mocked(getMyProfile).mockResolvedValue(profile);
    await loadStudentProfile("student-a");
    await refreshStudentProfile("student-a");
    expect(getMyProfile).toHaveBeenCalledTimes(2);
  });

  it("인증 전에 시작한 느린 응답이 인증 후 새 정보를 덮어쓰지 않는다", async () => {
    const old = deferred();
    const updated = { ...profile, has_completed: false };
    vi.mocked(getMyProfile).mockReturnValueOnce(old.promise).mockResolvedValueOnce(updated);
    const first = loadStudentProfile("student-a");
    await refreshStudentProfile("student-a");
    old.resolve(profile);
    await first;
    expect(useStudentProfileStore.getState().profile).toEqual(updated);
  });

  it("계정 변경과 로그아웃은 캐시를 비우며 이전 계정 응답을 무시한다", async () => {
    const old = deferred();
    vi.mocked(getMyProfile).mockReturnValueOnce(old.promise).mockResolvedValueOnce(profile);
    const first = loadStudentProfile("student-a");
    useSessionStore.setState({ studentToken: "student-b", studentId: "b" });
    expect(useStudentProfileStore.getState().profile).toBeNull();
    await loadStudentProfile("student-b");
    old.resolve({ ...profile, has_completed: false });
    await first;
    expect(useStudentProfileStore.getState()).toMatchObject({ token: "student-b", profile });
    useSessionStore.setState({ studentToken: null, studentId: null });
    expect(useStudentProfileStore.getState().profile).toBeNull();
  });

  it("백그라운드 갱신이 실패해도 기존 정보를 유지하고 다음 진입에 재시도한다", async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce(profile).mockRejectedValueOnce(new Error("일시 오류")).mockResolvedValueOnce(profile);
    await loadStudentProfile("student-a");
    await refreshStudentProfile("student-a");
    expect(useStudentProfileStore.getState()).toMatchObject({ profile, fetching: false });
    await loadStudentProfile("student-a");
    expect(getMyProfile).toHaveBeenCalledTimes(3);
  });

  it("401 응답은 기존 정보를 지우고 재로그인 상태로 전환한다", async () => {
    vi.mocked(getMyProfile).mockResolvedValueOnce(profile).mockRejectedValueOnce(new ApiError("만료", 401));
    await loadStudentProfile("student-a");
    await refreshStudentProfile("student-a");
    expect(useStudentProfileStore.getState()).toMatchObject({ profile: null, unauthorized: true, fetching: false });
  });
});
