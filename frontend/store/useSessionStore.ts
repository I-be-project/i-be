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
  gender: "male" | "female";
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
  // 사진 업로드 성공 여부 — 설문을 마친 뒤 /explore/photo에서 올린다. 사진 없이 앱을
  // 닫았다가 다시 들어와도 흐름 가드(resumeScreen)가 이 값을 보고 사진 화면으로 되돌린다.
  hasPhoto: boolean;
  // 진행 중 세션 id — Q7 첫 답변 저장 때 백엔드가 발급, 이후 저장·완료에 재사용.
  sessionId: string | null;
  // 설문(Q9)까지 마치고 완료 저장에 성공했는지. 재진입 시 종료 화면으로 라우팅하는 기준.
  surveyCompleted: boolean;
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
  setHasPhoto: (v: boolean) => void;
  setInputMode: (mode: InputMode) => void;
  addAnswer: (answer: Answer) => void;
  // questionId 기준 upsert — Q1~6에서 뒤로 갔다가 답을 바꿔도 중복 없이 갱신한다.
  upsertAnswer: (answer: Answer) => void;
  setSessionId: (id: string) => void;
  setSurveyCompleted: (v: boolean) => void;
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
  hasPhoto: false,
  sessionId: null,
  surveyCompleted: false,
  persona: null,
  cardId: null,
  riasecScores: null,
  pairCode: null,
  q7aSelection: null,
  q7bSelection: null,
  q8Selection: null,
  q9Selection: null,

  // 새 인증 주체로 전환(로그인/가입). 다른 학생으로 바뀌면 이전 사용자의 진행 중
  // 세션·답변이 남아 교차 오염(다른 학생의 sessionId를 내 토큰으로 전송 → 403)되지
  // 않도록 함께 초기화한다. 같은 학생이 재로그인하면 진행상황을 보존해 이어서 할 수 있게 한다.
  setAuth: (token, id) =>
    set((state) => {
      const sameStudent = state.studentId === id;
      if (sameStudent) {
        return { studentToken: token, studentId: id };
      }
      return {
        studentToken: token,
        studentId: id,
        inputMode: null,
        answers: [],
        hasPhoto: false,
        sessionId: null,
        surveyCompleted: false,
        persona: null,
        cardId: null,
        riasecScores: null,
        pairCode: null,
        q7aSelection: null,
        q7bSelection: null,
        q8Selection: null,
        q9Selection: null,
      };
    }),
  setStudentInfo: (info) => set({ studentInfo: info }),
  setHasPhoto: (v) => set({ hasPhoto: v }),
  setInputMode: (mode) => set({ inputMode: mode }),
  addAnswer: (answer) =>
    set((state) => ({ answers: [...state.answers, answer] })),
  upsertAnswer: (answer) =>
    set((state) => {
      const idx = state.answers.findIndex(
        (a) => a.questionId === answer.questionId
      );
      if (idx === -1) return { answers: [...state.answers, answer] };
      const next = [...state.answers];
      next[idx] = answer;
      return { answers: next };
    }),
  setSessionId: (id) => set({ sessionId: id }),
  setSurveyCompleted: (v) => set({ surveyCompleted: v }),
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
      hasPhoto: false,
      sessionId: null,
      surveyCompleted: false,
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
      // 인증 정보 + 진행상황을 영속화한다. 새로고침·재진입 시 마지막으로 진행하던
      // 화면으로 이어서 라우팅하기 위함(같은 기기/브라우저 한정). 페르소나/카드 등
      // 파생 결과는 프로필 API에서 다시 받으므로 저장하지 않는다.
      partialize: (state) => ({
        studentToken: state.studentToken,
        studentId: state.studentId,
        studentInfo: state.studentInfo,
        inputMode: state.inputMode,
        answers: state.answers,
        hasPhoto: state.hasPhoto,
        sessionId: state.sessionId,
        surveyCompleted: state.surveyCompleted,
        riasecScores: state.riasecScores,
        pairCode: state.pairCode,
        q7aSelection: state.q7aSelection,
        q7bSelection: state.q7bSelection,
        q8Selection: state.q8Selection,
        q9Selection: state.q9Selection,
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
