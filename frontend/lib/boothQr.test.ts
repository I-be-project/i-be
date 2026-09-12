import { describe, it, expect } from "vitest";
import { boothQrFilename, wrapBoothLabel } from "@/lib/boothQr";

describe("boothQrFilename", () => {
  it("코드만으로 파일명을 만든다", () => {
    expect(boothQrFilename("K7M2QX")).toBe("booth-K7M2QX.png");
  });
});

describe("wrapBoothLabel", () => {
  it("짧은 이름은 한 줄 그대로 둔다", () => {
    expect(wrapBoothLabel("드론 시뮬레이션")).toEqual(["드론 시뮬레이션"]);
  });

  it("긴 이름은 두 줄로 나눈다", () => {
    const lines = wrapBoothLabel("미래 원자력 기술의 핵심, 나만의 SMART100 브릭 만들기");

    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toBe("미래 원자력 기술의 핵심, 나만의 SMART100 브릭 만들기");
  });

  it("두 줄의 길이가 크게 치우치지 않는다", () => {
    const [head, tail] = wrapBoothLabel("하늘을 읽는 사람들, 구름의 원리를 파헤치다");

    expect(Math.abs(head.length - tail.length)).toBeLessThanOrEqual(6);
  });

  it("공백이 없는 긴 이름은 나누지 않는다", () => {
    const name = "가".repeat(30);

    expect(wrapBoothLabel(name)).toEqual([name]);
  });

  it("앞뒤 공백을 떼고 본다", () => {
    expect(wrapBoothLabel("  정내음  ")).toEqual(["정내음"]);
  });

  it("세 줄로는 나누지 않는다", () => {
    const lines = wrapBoothLabel("AI 소믈리에: 데이터로 맛 보는 스마트 힐링 카페");

    expect(lines.length).toBeLessThanOrEqual(2);
  });
});
