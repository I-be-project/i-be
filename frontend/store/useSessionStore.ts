import { create } from "zustand";

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

  setAuth: (token: string, id: string) => void;
  setStudentInfo: (info: StudentInfo) => void;
  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  setPersona: (persona: PersonaResult) => void;
  setCardId: (id: string) => void;
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

  setAuth: (token, id) => set({ studentToken: token, studentId: id }),
  setStudentInfo: (info) => set({ studentInfo: info }),
  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  setPersona: (persona) => set({ persona }),
  setCardId: (id) => set({ cardId: id }),
  reset: () =>
    set({
      studentToken: null,
      studentId: null,
      studentInfo: null,
      inputMode: null,
      answers: [],
      persona: null,
      cardId: null,
    }),
}));
