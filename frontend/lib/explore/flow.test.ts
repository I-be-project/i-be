import { describe, it, expect, beforeEach } from "vitest";
import { reconcileCompletionFromProfile, resumeScreen, type FlowState } from "./flow";
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
  it("가입 직후(사진 미업로드, 진행 없음)엔 사진 화면으로 보낸다", () => {
    expect(resumeScreen(base)).toBe("photo");
  });

  it("사진을 올렸고 진행이 없으면 탐험 브리핑으로 보낸다", () => {
    expect(resumeScreen({ ...base, hasPhoto: true })).toBe("explore");
  });

  it("Q1~6 진행 중이면 사진 여부와 무관하게 questions로 보낸다(기존 진행 학생 보호)", () => {
    expect(
      resumeScreen({
        ...base,
        hasPhoto: false,
        answers: [{ questionId: 1, value: "a" }],
      })
    ).toBe("questions");
  });

  it("설문 완료 상태면 사진 여부와 무관하게 done으로 보낸다", () => {
    expect(resumeScreen({ ...base, hasPhoto: false, surveyCompleted: true })).toBe(
      "done"
    );
  });
});

describe("reconcileCompletionFromProfile", () => {
  beforeEach(() => {
    useSessionStore.setState({ surveyCompleted: false });
  });

  const profile = (has_completed: boolean): ProfileSummary => ({
    has_completed,
    retry_enabled: false,
    student: null,
    persona: null,
    card: null,
  });

  it("백엔드가 완료로 보면 로컬 surveyCompleted를 true로 맞춘다", () => {
    reconcileCompletionFromProfile(profile(true));
    expect(useSessionStore.getState().surveyCompleted).toBe(true);
  });

  it("백엔드가 미완료면 로컬 상태를 건드리지 않는다", () => {
    reconcileCompletionFromProfile(profile(false));
    expect(useSessionStore.getState().surveyCompleted).toBe(false);
  });

  it("로컬이 이미 완료(true)인데 백엔드가 미완료여도 되돌리지 않는다(단방향 동기화)", () => {
    useSessionStore.setState({ surveyCompleted: true });
    reconcileCompletionFromProfile(profile(false));
    expect(useSessionStore.getState().surveyCompleted).toBe(true);
  });
});
