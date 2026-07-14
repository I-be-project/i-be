import { describe, it, expect } from "vitest";
import { resumeScreen, type FlowState } from "./flow";

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
