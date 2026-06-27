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

interface SessionStore {
  // 학생 인증 (새로고침 시 사라짐 — localStorage 미사용. 그땐 다시 로그인 필요)
  studentToken: string | null;
  studentId: string | null;

  inputMode: InputMode;
  answers: Answer[];
  persona: PersonaResult | null;
  cardId: string | null;

  setAuth: (token: string, id: string) => void;
  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  setPersona: (persona: PersonaResult) => void;
  setCardId: (id: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  studentToken: null,
  studentId: null,

  inputMode: null,
  answers: [],
  persona: null,
  cardId: null,

  setAuth: (token, id) => set({ studentToken: token, studentId: id }),
  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  setPersona: (persona) => set({ persona }),
  setCardId: (id) => set({ cardId: id }),
  reset: () =>
    set({
      studentToken: null,
      studentId: null,
      inputMode: null,
      answers: [],
      persona: null,
      cardId: null,
    }),
}));
