export interface Question {
  id: number;
  text: string;
  type: string; // 현재는 "text"(자유 응답)만 사용
}

// 1~6번 자유 응답형 설문 (mock). 진짜 문항은 추후 교체 예정.
export const mockQuestions: Question[] = [
  {
    id: 1,
    text: "요즘 가장 흥미를 느끼는 활동이나 주제는 무엇인가요?",
    type: "text",
  },
  {
    id: 2,
    text: "시간 가는 줄 모르고 몰입했던 경험을 떠올려보세요. 무엇을 하고 있었나요?",
    type: "text",
  },
  {
    id: 3,
    text: "친구들이 너에게 자주 부탁하거나 의지하는 일은 무엇인가요?",
    type: "text",
  },
  {
    id: 4,
    text: "어떤 문제를 해결할 때 가장 보람을 느끼나요?",
    type: "text",
  },
  {
    id: 5,
    text: "10년 뒤, 어떤 모습으로 일하고 있으면 좋겠나요?",
    type: "text",
  },
  {
    id: 6,
    text: "새로운 것을 배울 때 어떤 방식이 가장 잘 맞나요?",
    type: "text",
  },
];
