// NCS 직업기초능력 10개 역량 — 키와 한글 라벨.
// 백엔드 app/core/competencies.py와 같은 목록이고 같은 순서다. 이 순서가 레이더 차트 축 순서다.
export const COMPETENCIES = [
  { key: "communication", label: "의사소통" },
  { key: "creativity", label: "창의성" },
  { key: "analysis", label: "분석력" },
  { key: "challenge", label: "도전정신" },
  { key: "empathy", label: "공감" },
  { key: "collaboration", label: "협업" },
  { key: "thinking", label: "사고력" },
  { key: "judgment", label: "판단력" },
  { key: "self_understanding", label: "자기이해" },
  { key: "planning", label: "계획성" },
] as const;

// 부스가 속한 존. ''는 존을 모르는 부스(기존 등록분).
export type BoothZone = "F" | "L" | "Y" | "C" | "";

export const ZONE_LABELS: Record<BoothZone, string> = {
  F: "F(Future)존",
  L: "L(Love)존",
  Y: "Y(Yourself)존",
  C: "역량체험존",
  "": "미지정",
};

// 직업체험 부스는 역량 3개, 역량체험 부스는 1개.
export const REQUIRED_COMPETENCY_COUNT: Record<BoothZone, number | null> = {
  F: 3,
  L: 3,
  Y: 3,
  C: 1,
  "": null,
};
