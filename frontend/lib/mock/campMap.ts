/** 나로섬 탐험 캠프 — 공간 풀 (브리핑·Q1~6·Q7-A 공유) */

export interface CampSpot {
  title: string;
  subtitle: string;
  /** 저녁 별빛 프로그램 때 더 크게 열리는 공간 */
  evening?: boolean;
}

/**
 * 캠프 지도 간판 — 일상에서 바로 떠오르는 이름만 사용.
 * 세계관(별빛 프로그램 등)은 부제·스토리에서 녹인다.
 */
export const campSpotTitles = [
  "광장",
  "도구 창고",
  "만들기 방",
  "전망대",
  "게시판",
  "쉼터",
  "무대",
  "꾸미기 방",
  "야외 작업장",
  "안내소",
  "체험관",
  "모임방",
] as const;

export type CampSpotTitle = (typeof campSpotTitles)[number];

export const campTraditionIntro =
  "나로섬 캠프에는 ‘별빛 프로그램’이라는 저녁 전통이 있어. " +
  "낮에 팀과 코스를 마치고 돌아오면, 캠프 곳곳에 등불이 하나둘 켜지며 " +
  "만들기 방·무대·꾸미기 방 같은 공간이 특별히 열려.";

export const briefingCampMap: CampSpot[] = [
  { title: "광장", subtitle: "캠프 한가운데 — 팀이 모여 출발 신호를 듣는 곳" },
  { title: "도구 창고", subtitle: "낮 코스에 쓸 도구를 나눠 받는 곳" },
  {
    title: "만들기 방",
    subtitle: "손끝으로 무언가를 빚어 내는 곳 · 별빛 프로그램",
    evening: true,
  },
  { title: "전망대", subtitle: "섬 너머 바다와 코스를 한눈에 내려다보는 곳" },
  { title: "게시판", subtitle: "오늘의 발견을 메모와 그림으로 남기는 곳" },
  { title: "쉼터", subtitle: "코스를 마치고 친구들과 잠깐 숨 고르는 곳" },
  {
    title: "무대",
    subtitle: "빛과 소리로 장면을 그려 보는 곳 · 별빛 프로그램",
    evening: true,
  },
  {
    title: "꾸미기 방",
    subtitle: "깃발·옷·소품으로 분위기를 입히는 곳 · 별빛 프로그램",
    evening: true,
  },
  { title: "야외 작업장", subtitle: "울타리 밖, 나뭇가지와 돌로 직접 만드는 곳" },
  { title: "안내소", subtitle: "선배 안내단이 길과 도구를 알려 주는 곳" },
  { title: "체험관", subtitle: "작은 기기와 재료를 직접 만져 보며 느끼는 곳" },
  { title: "모임방", subtitle: "팀이 모여 다음 일을 정하는 방" },
];

export const eveningOpenHint =
  "해가 지니 캠프에 등불이 켜졌어요. 별빛 프로그램이 시작됩니다.";

export const eveningProgramSpots = briefingCampMap.filter((s) => s.evening);

export const q7aPromptHint =
  "캠프 공간에서 오늘 밤 다시 가보고 싶은 곳은?";
