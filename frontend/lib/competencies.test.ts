import { describe, expect, it } from "vitest";
import {
  countVisitedByZone,
  hasAnyScore,
  toChartData,
  toRadius,
} from "@/lib/competencies";

describe("toChartData", () => {
  it("응답이 없으면 10개 축을 0으로 채운다", () => {
    const data = toChartData(undefined);

    expect(data).toHaveLength(10);
    expect(data.every((d) => d.score === 0)).toBe(true);
  });

  it("축 순서는 항상 역량 정의 순서다", () => {
    const data = toChartData([
      { key: "planning", label: "계획성", score: 3 },
      { key: "communication", label: "의사소통", score: 1 },
    ]);

    expect(data[0].label).toBe("의사소통");
    expect(data[9].label).toBe("계획성");
    expect(data[0].score).toBe(1);
    expect(data[9].score).toBe(3);
  });

  it("응답에 없는 역량은 0으로 채운다", () => {
    const data = toChartData([{ key: "empathy", label: "공감", score: 2 }]);

    expect(data).toHaveLength(10);
    expect(data.find((d) => d.label === "공감")?.score).toBe(2);
    expect(data.find((d) => d.label === "협업")?.score).toBe(0);
  });
});

describe("hasAnyScore", () => {
  it("전부 0이면 false — 매핑이 아직 비어 있다는 뜻이다", () => {
    expect(hasAnyScore([{ key: "empathy", label: "공감", score: 0 }])).toBe(false);
  });

  it("하나라도 1점 이상이면 true", () => {
    expect(hasAnyScore([{ key: "empathy", label: "공감", score: 1 }])).toBe(true);
  });

  it("응답이 없으면 false", () => {
    expect(hasAnyScore(undefined)).toBe(false);
  });
});

describe("toRadius", () => {
  it("0점도 중심이 아니라 기본 10각형 위에 놓인다", () => {
    expect(toRadius(0)).toBeCloseTo(0.2);
  });

  it("점수가 오를수록 커지되 증가폭은 줄어든다 — 로그", () => {
    const step1 = toRadius(1) - toRadius(0);
    const step9 = toRadius(9) - toRadius(8);

    expect(step1).toBeGreaterThan(0);
    expect(step9).toBeGreaterThan(0);
    expect(step9).toBeLessThan(step1);
  });

  it("점수가 아무리 커도 축 밖으로 새지 않는다", () => {
    expect(toRadius(999)).toBeLessThanOrEqual(1);
  });
});

describe("countVisitedByZone", () => {
  it("참여가 없어도 F/L/Y/C 네 칸이 0으로 남는다", () => {
    expect(countVisitedByZone([])).toEqual([
      { zone: "F", count: 0 },
      { zone: "L", count: 0 },
      { zone: "Y", count: 0 },
      { zone: "C", count: 0 },
    ]);
  });

  it("존별로 세고 순서는 항상 F/L/Y/C다", () => {
    const rows = countVisitedByZone([
      { zone: "Y" },
      { zone: "F" },
      { zone: "F" },
      { zone: "C" },
    ]);

    expect(rows).toEqual([
      { zone: "F", count: 2 },
      { zone: "L", count: 0 },
      { zone: "Y", count: 1 },
      { zone: "C", count: 1 },
    ]);
  });

  it("존을 모르는 부스가 있을 때만 미지정 칸이 맨 뒤에 붙는다", () => {
    expect(countVisitedByZone([{ zone: "F" }])).toHaveLength(4);

    const rows = countVisitedByZone([{ zone: "F" }, {}, { zone: "" }]);

    expect(rows).toHaveLength(5);
    expect(rows[4]).toEqual({ zone: "", count: 2 });
  });
});
