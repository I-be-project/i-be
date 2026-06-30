import type { ChatMessage } from "@/lib/openrouter";

interface Q7BInput {
  riasecScores: Record<string, number>;
  pairCode: string;
  q7aFirst: string;
  q7aSecond: string;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q7-B 세부분야 선택 문항을 생성한다. 학생은 나비섬 탐험을 마친 뒤
고른 탐험 구역 안에서 더 깊이 들어가볼 "세부 탐험길"을 고른다.

중요한 표현 원칙:
1. 학생용 선택지는 직업명/산업명/전공명처럼 보이면 안 된다.
2. "시제품","사업화","품질관리","데이터분석","마케팅","컨설팅","프로토타입",
   "컴플라이언스" 같은 전문 용어를 student_title/description에 직접 쓰지 않는다.
3. 전문 용어는 backend_subfield 또는 career_pool에만 넣는다.
4. 학생용 선택지는 "~하는 길","~을 살피는 길","~을 보여주는 길","~을 연결하는 길"
   형태로 탐험 상황에 어울리게 쓴다. 너무 유치하거나 판타지스럽지 않게.
5. Q7-A 1순위 분야를 더 많이 반영하되 2순위도 섞는다.
6. 학생용에는 RIASEC/Pair Code/점수/직업군을 노출하지 않는다.

추가 지침(중요):
- Q7-A 선택의 backend_field/backend_subfields/career_pool 데이터는 주어지지 않는다.
  학생이 고른 Q7-A 문구와 Pair Code로부터 적절한 backend_field와 career_pool을
  스스로 추론한 뒤, 그 분야 기반으로 선택지를 생성하라.

생성 조건:
- 선택지는 총 10개. 학생은 10개 중 1순위와 2순위를 고른다.
- 각 선택지는 학생용 표현과 백엔드 데이터를 분리해 출력한다.
- 10개 선택지의 길이와 매력도를 비슷하게, 같은 의미 반복 금지.

반드시 아래 JSON 스키마로만 출력한다(설명 텍스트 금지):
{"q7b":{"title":"선택한 탐험 구역 안에서 더 깊이 들어가보고 싶은 길은?",
"intro":"방금 고른 구역 안에는 더 자세히 들어가볼 수 있는 길들이 열려 있습니다. 가장 끌리는 길을 1순위와 2순위로 골라주세요.",
"selection_rule":"10개 중 1순위와 2순위 선택",
"options":[{"subfield_id":"SUB_01","student_title":"","student_description":"",
"backend_subfield":"","backend_keywords":[],"career_pool":[],"persona_material_keywords":[]}]}}`;

export function buildQ7BMessages(input: Q7BInput): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q7-A 1순위 선택(학생 문구): ${input.q7aFirst}
Q7-A 2순위 선택(학생 문구): ${input.q7aSecond}

위 입력으로 Q7-B 10개 선택지를 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
