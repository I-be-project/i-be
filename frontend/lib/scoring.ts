import { mockQuestions, type RiasecType } from "@/lib/mock/questions";

export const RIASEC_ORDER: RiasecType[] = ["R", "I", "A", "S", "E", "C"];

// 선택지 ID → 옵션 역조회 맵 (모듈 로드 시 1회 구성)
const optionById = new Map(
  mockQuestions
    .flatMap((q) => q.options ?? [])
    .map((opt) => [opt.id, opt] as const),
);

export function computeScores(
  selectedOptionIds: string[],
): Record<RiasecType, number> {
  const scores = Object.fromEntries(
    RIASEC_ORDER.map((t) => [t, 0]),
  ) as Record<RiasecType, number>;

  for (const id of selectedOptionIds) {
    const opt = optionById.get(id);
    if (!opt) continue;
    scores[opt.primary] += 2;
    if (opt.secondary) scores[opt.secondary] += 1;
  }
  return scores;
}

export function derivePairCode(scores: Record<RiasecType, number>): string {
  const ranked = [...RIASEC_ORDER].sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return RIASEC_ORDER.indexOf(a) - RIASEC_ORDER.indexOf(b);
  });
  return ranked[0] + ranked[1];
}
