export interface DevQA {
  question: string;
  answer: string;
}

export interface DevPersona {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
}

// Q1~6: 고정 질문 (한 페이지에 함께 표시)
export const devCoreQuestions: DevQA[] = [
  { question: "어떤 문제를 해결하는 사람이 되고 싶나요?", answer: "자연과 사람을 동시에 지키는 일" },
  { question: "하루 중 가장 몰입되는 순간은?", answer: "새로운 도구로 무언가를 만들 때" },
  { question: "끌리는 작업 환경은?", answer: "야외 현장과 연구소를 오가는 환경" },
  { question: "나를 잘 나타내는 단어는?", answer: "분석적인, 활동적인, 꼼꼼한" },
  { question: "혼자 vs 함께?", answer: "혼자 깊이 파고든 뒤 동료와 완성" },
  { question: "예상치 못한 상황엔?", answer: "계획을 세워 차근차근 대응" },
];

// Q7~9: 적응형 생성 질문 (실제로는 AI 생성, 여기선 mock)
export const devAdaptiveQuestions: DevQA[] = [
  { question: "기술로 자연을 관측한다면 어떤 도구를 쓰고 싶나요?", answer: "드론과 센서" },
  { question: "현장에서 가장 보람을 느낄 순간은?", answer: "위험 지역을 안전하게 탐사했을 때" },
  { question: "10년 뒤 어떤 전문가로 불리고 싶나요?", answer: "생태를 지키는 탐사 기술 전문가" },
];

// Q10: 페르소나 후보 3개 — 학생이 1개 선택
export const devPersonaCandidates: DevPersona[] = [
  {
    name: "숲을 지키는 드론 전문가",
    tagline: "자연과 기술을 함께 활용해 생태를 지키는 미래형 탐사 역할",
    keywords: ["자연", "드론", "탐사", "기술", "보호"],
    fields: ["환경공학", "항공기술", "데이터 관측"],
  },
  {
    name: "미래 도시 설계자",
    tagline: "사람들이 더 나은 삶을 살 수 있는 공간을 기획하는 분석형 리더",
    keywords: ["분석", "공간", "기획", "문제해결", "도시혁신"],
    fields: ["건축공학", "스마트시티", "데이터분석"],
  },
  {
    name: "디지털 세계의 스토리텔러",
    tagline: "창의적인 아이디어로 사람들의 마음을 움직이는 콘텐츠 크리에이터",
    keywords: ["창의력", "스토리", "영상", "소통", "트렌드"],
    fields: ["미디어콘텐츠", "디지털마케팅", "커뮤니케이션"],
  },
];
