import { create } from "zustand";
import type { RiasecType } from "@/lib/mock/questions";
import type { Q7AOption } from "@/lib/mock/q7a";

export type InputMode = "chat" | "image" | "word" | "game" | null;

export interface Answer {
  questionId: number;
  value: string | string[];
}

export interface PersonaResult {
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
  recommendedBooths: string[];
}

// Q7-B 생성 선택지 (LLM 출력 options 항목의 부분집합)
export interface Q7BOption {
  subfield_id: string;
  student_title: string;
  student_description: string;
  backend_subfield: string;
  career_pool: string[];
}

// Q8 표현칩 / Q9 주제칩 (LLM 출력 칩의 부분집합)
export interface Q8Chip {
  chip_id: string;
  text: string;
}
export interface Q9Chip {
  chip_id: string;
  text: string;
}

// Q10 페르소나 이름 카드
export interface NameCard {
  name_id: string;
  persona_name: string;
  short_description: string;
  emphasis: string;
}

// 회원가입 때 입력한 학생 정보. 백엔드가 이 값을 돌려주는 API가 없어 가입 시 보관한다.
// 메모리 전용 — 새로고침하면 사라진다(localStorage 미사용).
export interface StudentInfo {
  school: string;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
}

interface SessionStore {
  // 학생 인증 (새로고침 시 사라짐 — localStorage 미사용. 그땐 다시 로그인 필요)
  studentToken: string | null;
  studentId: string | null;
  studentInfo: StudentInfo | null;

  inputMode: InputMode;
  answers: Answer[];
  persona: PersonaResult | null;
  cardId: string | null;
  riasecScores: Record<RiasecType, number> | null;
  pairCode: string | null;
  q7aSelection: { first: Q7AOption; second: Q7AOption } | null;
  q7bSelection: { first: Q7BOption; second: Q7BOption } | null;
  q8Selection: { chips: Q8Chip[]; freeText: string } | null;
  q9Selection: { chips: Q9Chip[]; freeText: string } | null;
  q10Selection: NameCard | null;

  setAuth: (token: string, id: string) => void;
  setStudentInfo: (info: StudentInfo) => void;
  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  setPersona: (persona: PersonaResult) => void;
  setCardId: (id: string) => void;
  setRiasec: (scores: Record<RiasecType, number>, pairCode: string) => void;
  setQ7aSelection: (sel: { first: Q7AOption; second: Q7AOption }) => void;
  setQ7bSelection: (sel: { first: Q7BOption; second: Q7BOption }) => void;
  setQ8Selection: (sel: { chips: Q8Chip[]; freeText: string }) => void;
  setQ9Selection: (sel: { chips: Q9Chip[]; freeText: string }) => void;
  setQ10Selection: (card: NameCard) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  studentToken: null,
  studentId: null,
  studentInfo: null,

  inputMode: null,
  answers: [],
  persona: null,
  cardId: null,
  riasecScores: null,
  pairCode: null,
  q7aSelection: null,
  q7bSelection: null,
  q8Selection: null,
  q9Selection: null,
  q10Selection: null,

  setAuth: (token, id) => set({ studentToken: token, studentId: id }),
  setStudentInfo: (info) => set({ studentInfo: info }),
  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  setPersona: (persona) => set({ persona }),
  setCardId: (id) => set({ cardId: id }),
  setRiasec: (scores, pairCode) => set({ riasecScores: scores, pairCode }),
  setQ7aSelection: (sel) => set({ q7aSelection: sel }),
  setQ7bSelection: (sel) => set({ q7bSelection: sel }),
  setQ8Selection: (sel) => set({ q8Selection: sel }),
  setQ9Selection: (sel) => set({ q9Selection: sel }),
  setQ10Selection: (card) => set({ q10Selection: card }),
  reset: () =>
    set({
      studentToken: null,
      studentId: null,
      studentInfo: null,
      inputMode: null,
      answers: [],
      persona: null,
      cardId: null,
      riasecScores: null,
      pairCode: null,
      q7aSelection: null,
      q7bSelection: null,
      q8Selection: null,
      q9Selection: null,
      q10Selection: null,
    }),
}));
