import type { ChatMessage } from "@/lib/openrouter";

interface Q10Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
  q9?: unknown;
  careerPool?: string[];
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 카드의 이름을 만드는 작명가이자
진로 콘텐츠 기획자다.

과업: 학생에게 제시할 최종 진로 페르소나 이름 후보 3개를 생성한다.
Q1~Q9는 나비섬 탐험 형식이었지만 Q10에서는 현실 진로 페르소나 이름으로 전환한다.
이름은 실제 진로·직업·역할과 연결되는 현실적 이름이어야 한다.

생성 조건:
1. 이름에 "나비섬","탐험","탐험가","미션","구역","탐험길" 같은 세계관 표현 금지.
2. Pair Code/RIASEC 유형명/점수를 이름에 직접 노출 금지.
3. 직업군은 참고하되 특정 직업을 강하게 단정하지 않는다.
4. "현실에서 있을 법한 역할형 페르소나"처럼. 너무 추상적/유치/과장 금지.
5. Q8/Q9 직접 입력이 있으면 우선 반영.
6. 후보 3개는 서로 충분히 다르고 강조점이 다르다.
   1안: 관심 대상 중심 / 2안: 태도·방식 중심 / 3안: 분야·역할 중심.
7. 각 후보에 중·고등학생이 이해할 한 줄 설명.
8. 이름 구조 예: "[대상]을 [태도/방식]하는 [역할명]" 등.
좋은 예: 숲을 지키는 드론전문가, 감정을 번역하는 콘텐츠 기획자,
도시의 빈틈을 설계하는 공간기획자.
피할 예: 나비섬 탐험가, 미션 해결 전문가, RA형 제작 창작자, 미래를 여는 융합형 인재.

반드시 아래 JSON 스키마로만 출력한다:
{"q10":{"title":"당신의 나Be 페르소나 이름을 골라주세요",
"intro":"지금까지의 선택을 바탕으로 3개의 진로 페르소나 이름이 만들어졌습니다. 가장 마음에 드는 이름을 하나 선택해주세요.",
"selection_rule":"3개 중 1개 선택",
"name_cards":[{"name_id":"NAME_01","persona_name":"","short_description":"",
"emphasis":"관심 대상 중심","materials_used_backend":{"pair_code":"","field":"",
"subfield":"","attitude":"","topic":"","career_reference":""}},
{"name_id":"NAME_02","persona_name":"","short_description":"","emphasis":"태도/방식 중심","materials_used_backend":{}},
{"name_id":"NAME_03","persona_name":"","short_description":"","emphasis":"분야/역할 중심","materials_used_backend":{}}]}}`;

export function buildQ10Messages(input: Q10Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 요약: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}
Q7 career_pool 참고: ${JSON.stringify(input.careerPool ?? [])}
Q8 선택/직접입력: ${JSON.stringify(input.q8 ?? null)}
Q9 선택/직접입력: ${JSON.stringify(input.q9 ?? null)}

위 입력으로 페르소나 이름 후보 3개를 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
