import { describe, it, expect } from "vitest";
import { q7aOptionsByPairCode, getQ7AOptions } from "./q7a";
import { RIASEC_ORDER } from "@/lib/scoring";

describe("q7aOptionsByPairCode", () => {
  it("30개 Pair Code(순서쌍)를 모두 포함한다", () => {
    const expected: string[] = [];
    for (const a of RIASEC_ORDER)
      for (const b of RIASEC_ORDER) if (a !== b) expected.push(a + b);
    expect(Object.keys(q7aOptionsByPairCode).sort()).toEqual(expected.sort());
  });

  it("각 Pair Code는 6개 선택지를 가진다", () => {
    for (const opts of Object.values(q7aOptionsByPairCode)) {
      expect(opts).toHaveLength(6);
    }
  });

  it("모든 선택지 ID는 전역적으로 고유하다", () => {
    const ids = Object.values(q7aOptionsByPairCode).flatMap((o) =>
      o.map((x) => x.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getQ7AOptions는 해당 코드의 선택지를 반환한다", () => {
    expect(getQ7AOptions("AI")).toHaveLength(6);
    expect(getQ7AOptions("AI")[0].label.length).toBeGreaterThan(0);
  });
});
