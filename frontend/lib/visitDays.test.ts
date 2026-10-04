import { describe, expect, it } from "vitest";
import { groupVisitsByDay } from "./visitDays";

// 로컬 시간대 기준으로 묶으므로 테스트 입력도 로컬 시각(Z 없는 ISO)으로 만든다.
describe("참여 기록 날짜별 묶기", () => {
  it("같은 날 기록을 한 묶음으로, 입력 순서를 유지한다", () => {
    const visits = [
      { id: "a", visited_at: "2026-10-02T18:39:00" },
      { id: "b", visited_at: "2026-09-13T13:20:00" },
      { id: "c", visited_at: "2026-09-13T10:40:00" },
    ];
    const days = groupVisitsByDay(visits);
    expect(days.map((d) => [d.key, d.month, d.day, d.weekday, d.visits.map((v) => v.id)])).toEqual([
      ["2026-10-02", 10, 2, "금", ["a"]],
      ["2026-09-13", 9, 13, "일", ["b", "c"]],
    ]);
  });

  it("방문 시각이 없거나 잘못된 기록은 뺀다", () => {
    expect(groupVisitsByDay([{ visited_at: null }, { visited_at: "nope" }, {}])).toEqual([]);
  });
});
