export interface Question {
  id: number;
  text: string;
  type: string; // "text", "image-select", "word-select", "game"
  options?: string[];
  imageUrls?: string[];
}

export const mockQuestions: Record<string, Question[]> = {
  chat: [
    {
      id: 1,
      text: "자유롭게 상상해봐요. 어떤 문제를 해결하는 사람이 되고 싶나요?",
      type: "text",
    },
    {
      id: 2,
      text: "하루 중 가장 몰입이 잘 되는 순간은 언제인가요?",
      type: "text",
    },
  ],
  image: [
    {
      id: 1,
      text: "자연 속에서 일하는 것에 끌리나요?",
      type: "image-select",
      options: ["숲", "드론", "지도", "캠핑", "구조 활동"],
      imageUrls: [
        "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=400&auto=format&fit=crop", // 숲
        "https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=400&auto=format&fit=crop", // 드론
        "https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=400&auto=format&fit=crop", // 지도
        "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?q=80&w=400&auto=format&fit=crop", // 캠핑
        "https://images.unsplash.com/photo-1516934827008-0130ce52554e?q=80&w=400&auto=format&fit=crop", // 구조
      ],
    },
    {
      id: 2,
      text: "어떤 작업 환경이 마음에 드나요?",
      type: "image-select",
      options: ["연구소", "스타트업 오피스", "야외 현장", "스튜디오", "전 세계 어디든"],
      imageUrls: [
        "https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=400&auto=format&fit=crop", // 연구소
        "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=400&auto=format&fit=crop", // 오피스
        "https://images.unsplash.com/photo-1508344928928-7137b29de216?q=80&w=400&auto=format&fit=crop", // 현장
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=400&auto=format&fit=crop", // 스튜디오
        "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=400&auto=format&fit=crop", // 전 세계
      ],
    },
  ],
  word: [
    {
      id: 1,
      text: "나를 가장 잘 나타내는 단어 3가지를 골라주세요.",
      type: "word-select",
      options: ["분석적인", "창의적인", "활동적인", "공감하는", "주도적인", "꼼꼼한", "적응력 있는", "협동적인"],
    },
  ],
  game: [
    {
      id: 1,
      text: "두 가지 중 골라주세요!",
      type: "game",
      options: ["혼자 깊이 파고들기", "동료들과 함께 완성하기"],
    },
    {
      id: 2,
      text: "이럴 땐 어떻게 할까요?",
      type: "game",
      options: ["계획을 세워 직진", "상황에 맞춰 유연하게"],
    },
  ]
};
