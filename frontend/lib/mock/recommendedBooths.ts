import type { ProfileBoothStatus } from "@/lib/api";

export const mockRecommendedBooths: ProfileBoothStatus[] = [
  {
    id: "demo-recommended-drone",
    name: "드론 조종 체험",
    description: "추천 화면 미리보기용 예시 부스야. 드론을 조종하며 미래 기술을 만나봐.",
    zone: "F",
    visited: false,
  },
  {
    id: "demo-recommended-design",
    name: "나만의 캐릭터 디자인",
    description: "추천 화면 미리보기용 예시 부스야. 상상 속 캐릭터를 직접 그려봐.",
    zone: "L",
    visited: false,
  },
  {
    id: "demo-recommended-career",
    name: "나의 진로 탐색",
    description: "추천 화면 미리보기용 예시 부스야. 좋아하는 일과 새로운 가능성을 찾아봐.",
    zone: "Y",
    visited: false,
  },
];
