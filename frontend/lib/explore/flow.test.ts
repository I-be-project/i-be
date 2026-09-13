import { describe, it, expect, beforeEach } from "vitest";
import { reconcileFromProfile, resumeScreen, type FlowState } from "./flow";
import { useSessionStore } from "@/store/useSessionStore";
import type { ProfileSummary } from "@/lib/api";

const base: FlowState = {
  answers: [],
  riasecScores: null,
  pairCode: null,
  q7aSelection: null,
  q7bSelection: null,
  q8Selection: null,
  q9Selection: null,
  surveyCompleted: false,
  hasPhoto: false,
};

describe("resumeScreen", () => {
  it("가입 직후(사진 미업로드, 진행 없음)엔 탐험 브리핑으로 보낸다", () => {
    expect(resumeScreen(base)).toBe("explore");
  });

  it("사진을 이미 올렸어도 진행 전이면 탐험 브리핑으로 보낸다", () => {
    expect(resumeScreen({ ...base, hasPhoto: true })).toBe("explore");
  });

  it("Q1~6 진행 중이면 사진 여부와 무관하게 questions로 보낸다", () => {
    expect(
      resumeScreen({
        ...base,
        hasPhoto: false,
        answers: [{ questionId: 1, value: "a" }],
      })
    ).toBe("questions");
  });

  it("설문을 마쳤지만 사진을 안 올렸으면 사진 화면으로 보낸다(재진입 시 사진 요구)", () => {
    expect(
      resumeScreen({ ...base, surveyCompleted: true, hasPhoto: false })
    ).toBe("photo");
  });

  it("설문과 사진을 모두 마쳤으면 종료 화면으로 보낸다", () => {
    expect(resumeScreen({ ...base, surveyCompleted: true, hasPhoto: true })).toBe(
      "done"
    );
  });
});

describe("reconcileFromProfile", () => {
  beforeEach(() => {
    useSessionStore.setState({ surveyCompleted: false, hasPhoto: false, retakingSurvey: false });
  });

  const profile = (
    has_completed: boolean,
    photo_url: string | null = null
  ): ProfileSummary => ({
    has_completed,
    retry_enabled: false,
    student: {
      school: "테스트고",
      grade: 1,
      class_no: 1,
      student_no: 1,
      name: "홍길동",
      gender: "male",
      photo_url,
    },
    persona: null,
    card: null,
  });

  it("백엔드가 완료로 보면 로컬 surveyCompleted를 true로 맞춘다", () => {
    reconcileFromProfile(profile(true));
    expect(useSessionStore.getState().surveyCompleted).toBe(true);
  });

  it("재참여는 인증과 사진을 보존하고 새 세션으로 시작하며 이전 완료 이력에 밀리지 않는다", () => {
    useSessionStore.setState({
      studentToken: "token", studentId: "student", hasPhoto: true,
      surveyCompleted: true, sessionId: "old-session",
      answers: [{ questionId: 1, value: "old-answer" }],
      q9Selection: { chips: [], freeText: "old" },
    });
    useSessionStore.getState().restartSurvey();
    reconcileFromProfile(profile(true, "https://example.com/photo.jpg"));
    const state = useSessionStore.getState();
    expect(state.studentToken).toBe("token");
    expect(state.studentId).toBe("student");
    expect(state.hasPhoto).toBe(true);
    expect(state.sessionId).toBeNull();
    expect(state.answers).toEqual([]);
    expect(state.q9Selection).toBeNull();
    expect(state.retakingSurvey).toBe(true);
    expect(resumeScreen(state)).toBe("explore");
    state.setSurveyCompleted(true);
    expect(useSessionStore.getState().retakingSurvey).toBe(false);
    expect(resumeScreen(useSessionStore.getState())).toBe("done");
  });

  it("백엔드가 미완료면 로컬 상태를 건드리지 않는다", () => {
    reconcileFromProfile(profile(false));
    expect(useSessionStore.getState().surveyCompleted).toBe(false);
  });

  it("로컬이 이미 완료(true)인데 백엔드가 미완료여도 되돌리지 않는다(단방향 동기화)", () => {
    useSessionStore.setState({ surveyCompleted: true });
    reconcileFromProfile(profile(false));
    expect(useSessionStore.getState().surveyCompleted).toBe(true);
  });

  it("백엔드에 사진이 있으면 로컬 hasPhoto를 true로 맞춘다(기기 변경 시 재업로드 방지)", () => {
    reconcileFromProfile(profile(true, "https://example.com/photo.jpg"));
    expect(useSessionStore.getState().hasPhoto).toBe(true);
  });

  it("백엔드에 사진이 없으면 hasPhoto를 그대로 둔다 — 완료 학생은 사진 화면으로 간다", () => {
    reconcileFromProfile(profile(true, null));
    expect(useSessionStore.getState().hasPhoto).toBe(false);
  });

  it("student가 null이어도(미완료 프로필) 안전하게 동작한다", () => {
    const noStudent: ProfileSummary = {
      has_completed: false,
      retry_enabled: false,
      student: null,
      persona: null,
      card: null,
    };
    expect(() => reconcileFromProfile(noStudent)).not.toThrow();
    expect(useSessionStore.getState().hasPhoto).toBe(false);
  });
});
