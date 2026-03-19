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
  inputMode: InputMode;
  answers: Answer[];
  persona: PersonaResult | null;
  cardId: string | null;

  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  setPersona: (persona: PersonaResult) => void;
  setCardId: (id: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  inputMode: null,
  answers: [],
  persona: null,
  cardId: null,

  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  setPersona: (persona) => set({ persona }),
  setCardId: (id) => set({ cardId: id }),
  reset: () =>
    set({ inputMode: null, answers: [], persona: null, cardId: null }),
}));
