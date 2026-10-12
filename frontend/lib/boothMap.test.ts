import { describe, expect, it } from "vitest";
import { getBoothMapLocation } from "./boothMap";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("leaflet booth mapping", () => {
  it("maps every displayed booth and all 74 physical cells exactly once", () => {
    const lines = readFileSync(resolve(process.cwd(), "../backend/scripts/booths.csv"), "utf8").trim().split(/\r?\n/).slice(1);
    const names = lines.flatMap(line => {
      const zone = line.split(",")[2];
      const field = line.match(/^(?:[^,]*,){3}("(?:[^"]|"")*"|[^,]*)/)?.[1];
      const name = field?.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field;
      return name && ["F", "L", "Y", "C"].includes(zone) && name !== "진로네비게이터" ? [name] : [];
    });
    expect(names).toHaveLength(71);
    const numbers: number[] = [];
    for (const name of names) {
      const location = getBoothMapLocation(name);
      expect(location, name).not.toBeNull();
      for (const point of location!.points) {
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(1);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(1);
        numbers.push(point.number!);
      }
    }
    expect(numbers).toHaveLength(74);
    expect(new Set(numbers).size).toBe(74);
    expect(numbers.sort((a, b) => a - b)).toEqual(Array.from({ length: 78 }, (_, i) => i + 3).filter(n => ![11, 37, 61, 62].includes(n)));
  });
  it("uses measured centers for the unevenly spaced final Y-zone columns", () => {
    const points = getBoothMapLocation("대전광역시 건축사회")!.points;
    expect(points[0].x).toBe(846.5 / 1510);
    expect(points[1].x).toBe(889.5 / 1510);
    expect(getBoothMapLocation("후우링 풍경만들기")!.points[0].x).toBe(890.5 / 1510);
  });
  it("recognizes official leaflet names and new booths without number collisions", () => {
    expect(getBoothMapLocation("AI(Tea) 소믈리에")?.points[0].number).toBe(3);
    expect(getBoothMapLocation("대전광역시 건축사회")?.points.map(p => p.number)).toEqual([70, 71]);
    expect(getBoothMapLocation("후우링 풍경만들기")?.points[0].number).toBe(80);
    expect(getBoothMapLocation("누노작가 (손끝의쉼)")?.points[0].x).not.toBe(getBoothMapLocation("AI(Tea) 소믈리에")?.points[0].x);
    expect(getBoothMapLocation("대전시청자미디어센터")).not.toBeNull();
  });
  it("uses leaflet numbers instead of program IDs", () => {
    expect(getBoothMapLocation("AI 티 소믈리에")?.points[0].number).toBe(3);
    expect(getBoothMapLocation("AI 향기 연구소")?.points[0].number).toBe(23);
    expect(getBoothMapLocation("AI 앱 만들기")?.points[0].number).toBe(24);
    expect(getBoothMapLocation("스피치ON 미션")?.points[0].number).toBe(26);
    expect(getBoothMapLocation("AI 향기 진로 체험")?.points[0].number).toBe(72);
  });
  it("marks both cells for shared booths", () => {
    expect(getBoothMapLocation("과학수사 경찰 체험")?.points.map(p => p.number)).toEqual([43, 44]);
    expect(getBoothMapLocation("유해발굴 기록 전시")?.points.map(p => p.number)).toEqual([36, 38]);
  });
  it("keeps coordinates tied to the image and declines unknown names", () => {
    const point = getBoothMapLocation("AI 티 소믈리에")!.points[0];
    expect(point.x).toBeCloseTo(799 / 1510);
    expect(point.y).toBeCloseTo(1047 / 1632);
    expect(getBoothMapLocation("미등록 부스")).toBeNull();
  });
});
