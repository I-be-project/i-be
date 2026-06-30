import type { ChatMessage } from "@/lib/openrouter";

interface Q8Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q8 태도 질문을 생성한다. 학생이 선택한 탐험길을 어떤 방식·태도·마음가짐으로
이어가고 싶은지 확인한다. 이 응답은 최종 페르소나 이름의 수식어/동사/분위기 재료다.

학생용 표현 원칙:
1. 탐험 이후 이어지는 장면처럼 쓴다.
2. "태도","직업","업무","역량","산업","전문가" 표현은 피한다.
3. "탐험길","단서","흐름","신호","사람","공간","장면","변화","이야기" 같은 표현 활용.
4. 단어칩(text)은 "~하는","~을 살피는","~을 이어가는","~을 바꾸는","~을 보여주는",
   "~을 지켜보는"처럼 페르소나 이름에 쓸 수 있는 형태로.
5. 전문 용어 금지(예: "데이터를 분석하는"→"숨은 흐름을 읽는").
6. 짧고 명확하게. RIASEC/Pair Code/점수/직업군 비노출.
7. backend(why_generated_backend)에는 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q8":{"title":"내가 고른 탐험길을 어떤 방식으로 이어가고 싶을까?",
"intro":"지금까지의 선택을 바탕으로, 당신이 이 탐험길을 이어가는 방식에 어울릴 만한 표현들이 열렸습니다.",
"answer_type":"word_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 나답다고 느껴지는 표현을 골라주세요.",
"word_chips":[{"chip_id":"ATT_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 원하는 표현을 직접 써도 좋아요."}}`;

export function buildQ8Messages(input: Q8Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 로그: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}

위 입력으로 Q8 단어칩을 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
