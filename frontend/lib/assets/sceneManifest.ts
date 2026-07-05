/** 나로섬 탐험 비주얼 에셋 메타 — welcome-bg.png 톤과 통일 */

import { campSpotTitles, type CampSpotTitle } from "@/lib/mock/campMap";
import type { SceneId } from "@/components/voyage/ExpeditionScene";

export type GeneratingStage = "q7b" | "q8" | "q9" | "q10";

export interface SceneAsset {
  id: string;
  src: string;
  /** PNG 없을 때 SVG 폴백 */
  fallbackSrc?: string;
  alt: string;
  videoSrc?: string;
}

export interface GeneratingCopy {
  main: string;
  sub: string;
}

export const generatingCopy: Record<GeneratingStage, GeneratingCopy> = {
  q7b: {
    main: "별빛 아래, 도구 선반을 펼치는 중…",
    sub: "네가 고른 공간에 맞는 도구를 골라 두고 있어",
  },
  q8: {
    main: "도구를 손에 쥔 채, 상상하는 중…",
    sub: "어떤 방식으로 써 볼지 그려 보고 있어",
  },
  q9: {
    main: "마음이 가는 대상을 찾는 중…",
    sub: "오늘 밤, 특히 더 살펴보고 싶은 것을 모으는 중",
  },
  q10: {
    main: "탐험대원증에 새길 이름을 짓는 중…",
    sub: "지금까지의 선택이 하나의 역할 이름으로 모이고 있어",
  },
};

const sceneBase = "/scenes";

function scenePaths(name: string): Pick<SceneAsset, "src" | "fallbackSrc"> {
  return {
    src: `${sceneBase}/${name}.png`,
    fallbackSrc: `${sceneBase}/${name}.svg`,
  };
}

function spotPaths(slug: string): Pick<SceneAsset, "src" | "fallbackSrc"> {
  return {
    src: `${sceneBase}/spots/${slug}.png`,
    fallbackSrc: `${sceneBase}/spots/${slug}.svg`,
  };
}

export const sceneAssets: Record<SceneId, SceneAsset> = {
  1: { id: "scene-01", alt: "나로섬 선착장에 도착한 아침 풍경", ...scenePaths("scene-01") },
  2: { id: "scene-02", alt: "캠프 광장에서 팀이 모이는 장면", ...scenePaths("scene-02") },
  3: { id: "scene-03", alt: "안내소에서 코스를 조정하는 오후", ...scenePaths("scene-03") },
  4: { id: "scene-04", alt: "도구 창고 앞에서 도구를 나누는 장면", ...scenePaths("scene-04") },
  5: { id: "scene-05", alt: "야외 작업장 근처 갈림길", ...scenePaths("scene-05") },
  6: { id: "scene-06", alt: "게시판에 오늘의 발견을 붙이는 해질녘", ...scenePaths("scene-06") },
};

export const eveningBridgeAsset: SceneAsset = {
  id: "bridge-evening",
  alt: "별빛 프로그램이 시작되는 저녁 캠프",
  ...scenePaths("bridge-evening"),
};

/** 탐험 브리핑 — 캠프 지도 풀스크린 (텍스트 목록 대체) */
export const briefingCampMapAsset: SceneAsset = {
  id: "briefing-scroll",
  alt: "나로섬 탐험 캠프 지도",
  ...scenePaths("briefing-scroll"),
};

/** 해석중 — 별빛·등불 밤하늘 */
export const interpretingNightAsset: SceneAsset = {
  id: "interpreting-night",
  alt: "별빛 아래 탐험 기록을 정리하는 밤",
  ...scenePaths("interpreting-night"),
};

export const spotSlugByTitle: Record<CampSpotTitle, string> = {
  광장: "gwangjang",
  "도구 창고": "dogu-changgo",
  "만들기 방": "mandeulgi-bang",
  전망대: "jeonmangdae",
  게시판: "gesipan",
  쉼터: "swimteo",
  무대: "mudae",
  "꾸미기 방": "kkumigi-bang",
  "야외 작업장": "yaoe-jakupjang",
  안내소: "annaeso",
  체험관: "cheheomgwan",
  모임방: "moimbang",
};

export function getSpotAsset(title: string): SceneAsset | null {
  if (!(campSpotTitles as readonly string[]).includes(title)) return null;
  const slug = spotSlugByTitle[title as CampSpotTitle];
  return { id: `spot-${slug}`, alt: `캠프 ${title}`, ...spotPaths(slug) };
}

export const generatingAssets: Record<GeneratingStage, SceneAsset> = {
  q7b: {
    id: "gen-q7b",
    alt: "별빛 프로그램 공간에서 도구를 고르는 장면",
    videoSrc: `${sceneBase}/gen-q7b.webm`,
    ...scenePaths("gen-q7b"),
  },
  q8: {
    id: "gen-q8",
    alt: "도구를 써 보는 방식을 떠올리는 장면",
    videoSrc: `${sceneBase}/gen-q8.webm`,
    ...scenePaths("gen-q8"),
  },
  q9: {
    id: "gen-q9",
    alt: "마음이 가는 대상을 살피는 장면",
    videoSrc: `${sceneBase}/gen-q9.webm`,
    ...scenePaths("gen-q9"),
  },
  q10: {
    id: "gen-q10",
    alt: "탐험대원증 이름이 만들어지는 장면",
    videoSrc: `${sceneBase}/gen-q10.webm`,
    ...scenePaths("gen-q10"),
  },
};

export function getCutsceneAsset(
  kind: "question" | "evening" | GeneratingStage,
  sceneId?: SceneId,
): SceneAsset {
  if (kind === "evening") return eveningBridgeAsset;
  if (kind === "question" && sceneId) return sceneAssets[sceneId];
  if (kind !== "question") return generatingAssets[kind];
  return sceneAssets[1];
}

export const GENERATING_MIN_MS = 2500;
