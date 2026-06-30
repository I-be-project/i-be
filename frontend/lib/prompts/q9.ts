import type { ChatMessage } from "@/lib/openrouter";

interface Q9Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q9 관심 대상/주제 질문을 생성한다. 학생이 선택한 탐험길에서 무엇을 더
살펴보고 싶은지, 그 길이 누구에게 닿으면 좋겠는지 확인한다. 이 응답은 최종
페르소나 이름의 "대상" 표현 재료다. 관심 주제는 고정 목록이 아니라 Q1~Q8을
바탕으로 생성한다.

학생용 표현 원칙:
1. 탐험 이후 장면처럼, 쉽게 묻는다("더 살펴보고 싶은 것","마음이 가는 장면",
   "도움이 닿았으면 하는 대상","바꾸고 싶은 불편함").
2. "문제의식","가치관","사회적 의제","직업 분야" 같은 딱딱한 표현 금지.
3. 주제칩(text)은 최종 이름의 대상이 될 만큼 구체적으로.
4. 전문 용어 금지(예: "환경보호"→"숲과 동물의 안전","접근성"→"누구나 이해하기 쉬운 안내").
5. 짧고 구체적으로. RIASEC/Pair Code/점수/직업군 비노출.
6. backend(why_generated_backend)에 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q9":{"title":"이 탐험길에서 가장 더 살펴보고 싶은 것은 무엇일까?",
"intro":"당신이 고른 탐험길 안에서 특히 마음이 가는 대상이나 장면을 골라주세요.",
"answer_type":"topic_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 마음이 가는 표현을 골라주세요.",
"topic_chips":[{"chip_id":"TOPIC_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 더 관심 있는 대상을 직접 써도 좋아요."}}`;

export function buildQ9Messages(input: Q9Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 로그: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}
Q8 선택: ${JSON.stringify(input.q8 ?? null)}

위 입력으로 Q9 주제칩을 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
