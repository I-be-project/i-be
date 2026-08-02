// 탐험 흐름(Q1~6 낮 → evening 브릿지 → Q7~9 밤 → 완료)의 라우팅 규칙 한 곳.
//
// 목표
//  1) 재진입·새로고침 시 "진행하던 화면"으로 이어서 라우팅한다(진행상황은 localStorage 영속).
//  2) Q1~6은 화면 안에서 앞뒤로 오갈 수 있지만, Q7(밤 프로그램) 이후로는 뒤로 못 간다.
//     → 이전 단계 화면으로 되돌아가면 가드가 다시 앞으로 밀어낸다(useBlockBack이 1차 차단).

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/useSessionStore";
import type { ProfileSummary } from "@/lib/api";

export type FlowScreen =
  | "photo"
  | "explore"
  | "questions"
  | "evening"
  | "path"
  | "done";

const SCREEN_PATH: Record<FlowScreen, string> = {
  photo: "/signup/photo",
  explore: "/explore",
  questions: "/explore/questions",
  evening: "/explore/evening",
  path: "/explore/path",
  done: "/explore/pending-card",
};

// 흐름 순서. 뒤로 못 가게 막을 때 "현재 화면보다 앞선 진행"이면 앞으로 민다.
const SCREEN_ORDER: FlowScreen[] = [
  "photo",
  "explore",
  "questions",
  "evening",
  "path",
  "done",
];
const screenIndex = (s: FlowScreen) => SCREEN_ORDER.indexOf(s);

// 라우팅 판단에 필요한 최소 상태 조각.
export interface FlowState {
  answers: { questionId: number; value: string | string[] }[];
  riasecScores: unknown;
  pairCode: string | null;
  q7aSelection: unknown;
  q7bSelection: unknown;
  q8Selection: unknown;
  q9Selection: unknown;
  surveyCompleted: boolean;
  hasPhoto: boolean;
}

// 저장된 진행상황으로 "지금 있어야 할 화면"을 계산한다(마지막으로 완료한 지점의 다음).
export function resumeScreen(s: FlowState): FlowScreen {
  if (s.surveyCompleted) return "done";
  // evening/path(밤)는 RIASEC/PairCode가 있어야 성립한다(canAccess와 동일 전제).
  // 이 값이 없는데 밤 선택(q7~9)만 남은 불일치 상태면 밤으로 보내면 안 된다
  // (가드가 canAccess=false로 되돌려 자기 자신으로 무한 리다이렉트 → 영구 로딩).
  // 그런 경우엔 Q1~6부터 다시 이어받아 RIASEC/PairCode를 재산출한다.
  const hasVoyageBase = Boolean(s.pairCode && s.riasecScores);
  if (hasVoyageBase) {
    // 밤 프로그램에 진입해 하나라도 답했으면 밤(path)에서 이어서 진행/완료한다.
    if (s.q9Selection || s.q8Selection || s.q7bSelection || s.q7aSelection)
      return "path";
    // Q6까지 마쳐 RIASEC/PairCode가 산출됐으면 밤 브릿지(evening)로.
    return "evening";
  }
  // Q1~6 진행 중.
  if (s.answers.length > 0) return "questions";
  // 진행 전(신규) — 사진을 아직 안 올렸으면 가입 2단계(사진)부터 마치게 한다.
  // (가입 직후 사진 화면을 건너뛰고 앱을 닫았다가 재진입하는 경로 차단.)
  if (!s.hasPhoto) return "photo";
  return "explore";
}

export function resumePath(s: FlowState): string {
  return SCREEN_PATH[resumeScreen(s)];
}

// 로컬 상태(surveyCompleted)는 localStorage 영속이라, 기기를 바꾸거나 저장소가
// 초기화되면 이미 완료한 학생도 로컬만 보면 "진행 이력 없음"이 된다. 그러면
// resumeScreen이 처음부터 다시 시키고, 재도전 세션이 하나 더 생겨 관리자 화면에서
// "완료 안 됨"으로 잘못 보이는 문제로 이어진다(원인 세션은 백엔드가 만들지만, 증상은
// 프론트가 백엔드 진실을 확인 안 하고 라우팅을 결정하는 데서 시작한다).
// 로그인·재진입 시 백엔드 프로필을 한 번 확인해 완료 상태를 로컬에 동기화한다.
// 단방향(완료→완료)만 맞춘다 — 백엔드가 미완료인데 로컬이 완료인 경우는 되돌리지 않는다
// (그 경우는 방금 이 기기에서 완료를 마친 직후일 뿐, 백엔드 쓰기가 아직 안 보일 수 있어서다).
export function reconcileCompletionFromProfile(profile: ProfileSummary): void {
  if (profile.has_completed) {
    useSessionStore.getState().setSurveyCompleted(true);
  }
}

// 각 화면의 하드 진입 조건(뒤로 밀기와 별개로, 정상적으로 그 화면에 있을 수 있는가).
function canAccess(screen: FlowScreen, s: FlowState): boolean {
  switch (screen) {
    case "photo":
      return true; // 토큰 유무만 별도 확인
    case "explore":
      return s.hasPhoto; // 사진 업로드 전엔 탐험 시작 불가
    case "questions":
      return true; // 토큰 유무만 별도 확인
    case "evening":
    case "path":
      return Boolean(s.pairCode && s.riasecScores);
    case "done":
      return s.surveyCompleted || Boolean(s.q9Selection);
    default:
      return true;
  }
}

function pickFlowState(): FlowState {
  const s = useSessionStore.getState();
  return {
    answers: s.answers,
    riasecScores: s.riasecScores,
    pairCode: s.pairCode,
    q7aSelection: s.q7aSelection,
    q7bSelection: s.q7bSelection,
    q8Selection: s.q8Selection,
    q9Selection: s.q9Selection,
    surveyCompleted: s.surveyCompleted,
    hasPhoto: s.hasPhoto,
  };
}

// 흐름 가드 훅. 각 explore 화면 상단에서 호출한다.
//  - 미로그인 → /login
//  - 진행상황이 이 화면보다 앞서 있으면 → 그 화면으로 밀어냄(뒤로가기 차단 + 이어하기)
//  - 이 화면에 있을 조건이 안 되면(비정상 진입) → 진행상황에 맞는 화면으로
// 반환값 ready가 true가 되기 전(복원 전/리다이렉트 대상)에는 화면을 그리지 않는다.
export function useFlowGuard(screen: FlowScreen): { ready: boolean } {
  const router = useRouter();
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const studentToken = useSessionStore((s) => s.studentToken);
  // 진행상황에 영향을 주는 필드들을 구독해 변경 시 가드를 재평가한다.
  const answersLen = useSessionStore((s) => s.answers.length);
  const pairCode = useSessionStore((s) => s.pairCode);
  const riasec = useSessionStore((s) => s.riasecScores);
  const q7a = useSessionStore((s) => s.q7aSelection);
  const q7b = useSessionStore((s) => s.q7bSelection);
  const q8 = useSessionStore((s) => s.q8Selection);
  const q9 = useSessionStore((s) => s.q9Selection);
  const completed = useSessionStore((s) => s.surveyCompleted);
  const hasPhoto = useSessionStore((s) => s.hasPhoto);

  useEffect(() => {
    if (!hasHydrated) return; // 복원 전에는 판단 보류
    if (!studentToken) {
      router.replace("/login");
      return;
    }
    const state = pickFlowState();
    const target = resumeScreen(state);
    // 이미 목표 화면에 있으면(같은 경로) 리다이렉트하지 않는다 — 어떤 상태에서도
    // 자기 자신으로 되미는 무한 리다이렉트(→ 영구 로딩/하늘 배경)를 원천 차단한다.
    if (SCREEN_PATH[target] === SCREEN_PATH[screen]) return;
    // 진행이 이 화면보다 앞서면 앞으로 민다(= 뒤로가기 무효).
    if (screenIndex(target) > screenIndex(screen)) {
      router.replace(SCREEN_PATH[target]);
      return;
    }
    // 정상 진입 조건 미충족(직접 URL 진입 등) → 진행상황에 맞는 화면으로.
    if (!canAccess(screen, state)) {
      router.replace(SCREEN_PATH[target]);
    }
  }, [
    hasHydrated,
    studentToken,
    answersLen,
    pairCode,
    riasec,
    q7a,
    q7b,
    q8,
    q9,
    completed,
    hasPhoto,
    screen,
    router,
  ]);

  if (!hasHydrated || !studentToken) return { ready: false };
  const state = pickFlowState();
  const target = resumeScreen(state);
  const ready =
    screenIndex(target) <= screenIndex(screen) && canAccess(screen, state);
  return { ready };
}

// 브라우저/하드웨어 뒤로가기 무력화. Q7(밤) 이후 화면에서 사용한다.
// popstate가 발생하면 즉시 현재 URL을 history에 다시 밀어 넣어 이동을 취소한다.
export function useBlockBack(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", window.location.href);
    const onPop = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);
}
