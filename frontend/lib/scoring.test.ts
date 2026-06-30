import { describe, it, expect } from "vitest";
import { computeScores, derivePairCode, RIASEC_ORDER } from "./scoring";

describe("computeScores", () => {
  it("primary에 +2, secondary에 +1을 더한다", () => {
    // q1-s: primary S (+2), secondary 없음
    // q3-c: primary C (+2), secondary I (+1)
    const scores = computeScores(["q1-s", "q3-c"]);
    expect(scores.S).toBe(2);
    expect(scores.C).toBe(2);
    expect(scores.I).toBe(1);
    expect(scores.R).toBe(0);
  });

  it("모르는 옵션 ID는 무시한다", () => {
    const scores = computeScores(["nope"]);
    expect(RIASEC_ORDER.every((t) => scores[t] === 0)).toBe(true);
  });
});

describe("derivePairCode", () => {
  it("최고·차순위 유형을 결합한다", () => {
    const code = derivePairCode({ R: 5, I: 3, A: 7, S: 0, E: 0, C: 0 });
    expect(code).toBe("AR");
  });

  it("동점은 RIASEC 표준 순서로 정렬한다", () => {
    const code = derivePairCode({ R: 2, I: 2, A: 0, S: 0, E: 0, C: 0 });
    expect(code).toBe("RI");
  });
});
