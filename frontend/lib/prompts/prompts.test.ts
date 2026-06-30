import { describe, it, expect } from "vitest";
import { buildQ7BMessages } from "./q7b";
import { buildQ10Messages } from "./q10";

const base = {
  riasecScores: { R: 2, I: 1, A: 6, S: 0, E: 1, C: 4 },
  pairCode: "AC",
  q1to6: ["q1-a", "q3-c"],
  q7aFirst: "감각을 손에 잡히는 물건으로 만드는 구역",
  q7aSecond: "정보를 보기 좋게 정돈하는 구역",
};

describe("buildQ7BMessages", () => {
  it("Pair Code와 Q7-A 선택을 프롬프트에 주입한다", () => {
    const msgs = buildQ7BMessages(base);
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("AC");
    expect(joined).toContain("감각을 손에 잡히는 물건으로 만드는 구역");
    expect(joined).toContain('"q7b"'); // 출력 스키마 키 안내 포함
  });
  it("system + user 두 역할을 만든다", () => {
    const msgs = buildQ7BMessages(base);
    expect(msgs.map((m) => m.role).sort()).toEqual(["system", "user"]);
  });
});

describe("buildQ10Messages", () => {
  it("이름 후보 3개 스키마 키를 안내한다", () => {
    const msgs = buildQ10Messages({
      ...base,
      q8: { chips: [{ text: "먼저 움직여 길을 여는" }], freeText: "" },
      q9: { chips: [{ text: "도시 속 숨은 불편함" }], freeText: "" },
      careerPool: ["UX디자이너"],
    });
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain('"name_cards"');
    expect(joined).toContain("도시 속 숨은 불편함");
  });
});
