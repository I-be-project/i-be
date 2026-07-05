import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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

// 회원가입 때 입력한 학생 정보. 백엔드가 이 값을 돌려주는 API가 없어 가입 시 보관한다.
// 인증 정보와 함께 localStorage에 유지된다(새로고침해도 프로필 폴백 표시 가능).
export interface StudentInfo {
  school: string;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
}

interface SessionStore {
  // 학생 인증 — localStorage에 유지되어 새로고침/재방문해도 로그인 상태가 복원된다.
  // (persist의 partialize로 아래 세 필드만 저장, 나머지 진행 상태는 휘발성)
  studentToken: string | null;
  studentId: string | null;
  studentInfo: StudentInfo | null;

  // persist 복원(rehydrate) 완료 여부. 라우트 가드가 복원 전에 /login으로 튕기지 않도록
  // 이 값이 true가 되기 전까지 인증 판단을 보류한다.
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  inputMode: InputMode;
  answers: Answer[];
  // 진행 중 세션 id — Q7 첫 답변 저장 때 백엔드가 발급, 이후 저장·완료에 재사용.
  sessionId: string | null;
  persona: PersonaResult | null;
  cardId: string | null;
  riasecScores: Record<RiasecType, number> | null;
  pairCode: string | null;
  q7aSelection: { first: Q7AOption; second: Q7AOption } | null;
  q7bSelection: { first: Q7BOption; second: Q7BOption } | null;
  q8Selection: { chips: Q8Chip[]; freeText: string } | null;
  q9Selection: { chips: Q9Chip[]; freeText: string } | null;

  setAuth: (token: string, id: string) => void;
  setStudentInfo: (info: StudentInfo) => void;
  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  setSessionId: (id: string) => void;
  setPersona: (persona: PersonaResult) => void;
  setCardId: (id: string) => void;
  setRiasec: (scores: Record<RiasecType, number>, pairCode: string) => void;
  setQ7aSelection: (sel: { first: Q7AOption; second: Q7AOption }) => void;
  setQ7bSelection: (sel: { first: Q7BOption; second: Q7BOption }) => void;
  setQ8Selection: (sel: { chips: Q8Chip[]; freeText: string }) => void;
  setQ9Selection: (sel: { chips: Q9Chip[]; freeText: string }) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
  studentToken: null,
  studentId: null,
  studentInfo: null,

  hasHydrated: false,
  setHasHydrated: (v) => set({ hasHydrated: v }),

  inputMode: null,
  answers: [],
  sessionId: null,
  persona: null,
  cardId: null,
  riasecScores: null,
  pairCode: null,
  q7aSelection: null,
  q7bSelection: null,
  q8Selection: null,
  q9Selection: null,

  setAuth: (token, id) => set({ studentToken: token, studentId: id }),
  setStudentInfo: (info) => set({ studentInfo: info }),
  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  setSessionId: (id) => set({ sessionId: id }),
  setPersona: (persona) => set({ persona }),
  setCardId: (id) => set({ cardId: id }),
  setRiasec: (scores, pairCode) => set({ riasecScores: scores, pairCode }),
  setQ7aSelection: (sel) => set({ q7aSelection: sel }),
  setQ7bSelection: (sel) => set({ q7bSelection: sel }),
  setQ8Selection: (sel) => set({ q8Selection: sel }),
  setQ9Selection: (sel) => set({ q9Selection: sel }),
  reset: () =>
    set({
      studentToken: null,
      studentId: null,
      studentInfo: null,
      inputMode: null,
      answers: [],
      sessionId: null,
      persona: null,
      cardId: null,
      riasecScores: null,
      pairCode: null,
      q7aSelection: null,
      q7bSelection: null,
      q8Selection: null,
      q9Selection: null,
    }),
    }),
    {
      name: "student-session",
      storage: createJSONStorage(() => localStorage),
      // 인증 정보만 영속화한다. 진행 중 답변·페르소나 등은 새로고침 시 초기화(휘발성).
      partialize: (state) => ({
        studentToken: state.studentToken,
        studentId: state.studentId,
        studentInfo: state.studentInfo,
      }),
      // SSR(서버)와 첫 클라이언트 렌더의 불일치(hydration mismatch)를 피하기 위해
      // 자동 복원을 끄고(SessionHydrator에서 명시적으로 rehydrate 호출), 복원이 끝나면
      // hasHydrated를 true로 올려 가드가 그때부터 인증 판단을 하도록 한다.
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
