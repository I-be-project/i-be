import { describe, expect, it } from "vitest";
import { hasAnyScore, toChartData } from "@/lib/competencies";

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
