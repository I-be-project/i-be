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

// 점수 배열의 형태만 요구한다. api.ts의 ProfileCompetencyScore를 import하지 않는 이유는
// api.ts가 이 파일의 BoothZone을 가져다 쓰기 때문이다 — 타입만 오가면 런타임 순환은
// 없지만, 한쪽 방향으로만 의존하게 두는 편이 읽기 쉽다.
// label은 실제 응답(ProfileCompetencyScore)에도 있다 — 옵셔널로 열어 둬야 그 값을 그대로
// 넘겨도(초과 속성 검사) 타입 에러가 나지 않는다. 이 함수는 label을 쓰지 않고 무시한다.
type Scored = { key: string; score: number; label?: string };

/**
 * 레이더 차트에 넣을 10개 축. 응답에 빠진 역량은 0으로 채운다.
 *
 * 축을 서버 응답 순서가 아니라 COMPETENCIES 순서로 고정한다. 축 순서가 화면마다
 * 달라지면 같은 학생의 그래프가 다르게 보인다.
 */
export function toChartData(
  scores: readonly Scored[] | undefined
): { label: string; score: number; r: number }[] {
  const byKey = new Map((scores ?? []).map((s) => [s.key, s.score]));
  return COMPETENCIES.map((c) => {
    const score = byKey.get(c.key) ?? 0;
    return { label: c.label, score, r: toRadius(score) };
  });
}

// 0점이 놓이는 반지름. 중심으로 붕괴시키지 않아야 기본 10각형이 남는다.
const BASE_RADIUS = 0.2;
// 이 점수에서 축이 꽉 찬다. 로그라 근처에서 이미 완만해서 값을 조금 틀려도 티가 안 난다.
const FULL_SCORE = 15;

/**
 * 점수 → 반지름(0~1). 만점이 정해진 지표가 아니라 로그로 눌러 그린다.
 *
 * 선형으로 두고 축 끝을 데이터 최댓값에 맞추면 부스를 1개만 찍어도 그 축이 꽉 찬다.
 * 축 끝을 상수로 고정하면 그 상수가 곧 '만점'이 되는데, 이 지표엔 만점이 없다.
 * 로그는 둘 다 피한다 — 점수가 아무리 쌓여도 바깥으로 새지 않고(클램프), 축 끝의
 * 값을 무엇으로 잡든 그림이 크게 달라지지 않는다.
 */
export function toRadius(score: number): number {
  const t = Math.log2(1 + Math.max(0, score)) / Math.log2(1 + FULL_SCORE);
  return BASE_RADIUS + (1 - BASE_RADIUS) * Math.min(1, t);
}

/** 점수가 하나라도 있는지. 전부 0이면 차트 대신 빈 상태를 보여준다. */
export function hasAnyScore(scores: readonly Scored[] | undefined): boolean {
  return (scores ?? []).some((s) => s.score > 0);
}
