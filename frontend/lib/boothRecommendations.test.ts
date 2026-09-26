import { describe, expect, it } from "vitest";
import { recommendBooths } from "./boothRecommendations";
import type { ProfileBoothStatus } from "./api";

const booths: ProfileBoothStatus[] = [
  { id: "1", name: "드론 비행", visited: true, description: "미래 기술 체험" },
  { id: "2", name: "드론 조종", visited: false },
  { id: "3", name: "쿠키 만들기", visited: false },
];
describe("페르소나 부스 추천", () => {
  it("관심 분야에 맞는 부스 중 미참여 부스를 우선한다", () => {
    expect(recommendBooths(booths, { name: "전문가", tagline: "", fields: ["드론"], keywords: ["기술"] }).map((b) => b.id)).toEqual(["2", "1"]);
  });
  it("페르소나 또는 일치하는 분야가 없으면 임의 추천을 만들지 않는다", () => {
    expect(recommendBooths(booths, null)).toEqual([]);
    expect(recommendBooths(booths, { name: "", tagline: "", fields: ["의료"], keywords: [] })).toEqual([]);
  });
});
