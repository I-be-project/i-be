# Q7~Q10 생성형 진로 페르소나 플로우 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Q1~6 선택형 결과로 RIASEC 점수·Pair Code를 산출하고, Q7-A(정적)→Q7-B/Q8/Q9/Q10(OpenRouter LLM 생성) 단계를 거쳐 학생이 진로 페르소나 이름을 선택하는 플로우를 구현한다.

**Architecture:** 점수 산출은 클라이언트 순수 함수. 생성 단계는 서버 라우트 핸들러(`app/api/generate/[stage]`)가 OpenRouter를 호출(키 서버 전용). 단일 오케스트레이터 페이지(`/explore/path`)가 stage state machine으로 선택 UI·로딩·에러를 구동하고, 각 단계 선택을 Zustand에 보관해 다음 LLM 호출 입력으로 넘긴다.

**Tech Stack:** Next.js 16 App Router, TypeScript(strict), Tailwind CSS 4, Zustand, Framer Motion, Vitest(신규 — 순수 로직 단위 테스트), OpenRouter(`openai/gpt-5.4-mini`).

## Global Constraints

- UI 텍스트는 한국어. 학생 화면에 RIASEC 유형명/점수/Pair Code/직업군 비노출.
- 경로 alias `@/*`. 클라이언트 컴포넌트는 파일 최상단 `"use client"`.
- OpenRouter 키는 서버 전용 — `NEXT_PUBLIC_` 접두사 금지. 모델 기본값 `openai/gpt-5.4-mini`.
- 생성 실패/키 없음 시 목업 폴백 없음 — 에러 + 다시 시도.
- 조건부 클래스는 `cn()`(`@/lib/utils`). 아이콘은 Lucide React.
- RIASEC 표준 순서: `R, I, A, S, E, C` (동점 정렬 기준).
- Pair Code 키 형식: 대문자 2글자 (예: `AR`). Q7-A 데이터 키도 동일.

---

## File Structure

- Create `lib/scoring.ts` — 점수 합산 + Pair Code 산출(순수).
- Create `lib/mock/q7a.ts` — Pair Code별 Q7-A 정적 선택지(30×6).
- Create `lib/openrouter.ts` — OpenRouter 호출 래퍼 + `OpenRouterError`.
- Create `lib/prompts/q7b.ts`, `q8.ts`, `q9.ts`, `q10.ts` — 프롬프트 메시지 빌더.
- Create `lib/generate.ts` — stage→빌더 매핑 + 검증(`runStage`).
- Create `app/api/generate/[stage]/route.ts` — POST 핸들러(동적 stage).
- Modify `store/useSessionStore.ts` — 신규 상태/세터.
- Create `components/explore/RankSelect.tsx`, `ChipSelect.tsx`, `NameCardSelect.tsx`, `GeneratingScreen.tsx`.
- Create `app/explore/path/page.tsx` — 오케스트레이터.
- Modify `app/explore/questions/page.tsx:37` — 다음 경로를 `/explore/path`로.
- Modify `.env.local.example`, `.env.local` — OpenRouter 변수.
- Create `vitest.config.ts`, modify `package.json` — 테스트 인프라.
- Test: `lib/scoring.test.ts`, `lib/mock/q7a.test.ts`, `lib/openrouter.test.ts`, `lib/prompts/prompts.test.ts`.

---

### Task 1: 테스트 인프라 + 점수 산출(scoring)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependencies, scripts)
- Create: `lib/scoring.ts`
- Test: `lib/scoring.test.ts`

**Interfaces:**
- Consumes: `mockQuestions`, `RiasecType` from `@/lib/mock/questions`.
- Produces:
  - `RIASEC_ORDER: RiasecType[]` = `["R","I","A","S","E","C"]`
  - `computeScores(selectedOptionIds: string[]): Record<RiasecType, number>`
  - `derivePairCode(scores: Record<RiasecType, number>): string`

- [ ] **Step 1: 테스트 도구 설치**

Run:
```bash
npm install -D vitest@^2
```
Expected: `vitest` added to devDependencies, exit 0.

- [ ] **Step 2: vitest 설정 작성**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

Modify `package.json` `"scripts"` — `"lint"` 줄 뒤에 추가:
```json
    "test": "vitest run",
```

- [ ] **Step 4: 실패 테스트 작성**

Create `lib/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeScores, derivePairCode, RIASEC_ORDER } from "./scoring";

describe("computeScores", () => {
  it("primary에 +2, secondary에 +1을 더한다", () => {
    // q1-s: primary S (+2), secondary 없음
    // q3-c: primary C (+2), secondary I (+1)
    const scores = computeScores(["q1-s", "q3-c"]);
    expect(scores.S).toBe(2);
    expect(scores.C).toBe(2);
    expect(scores.I).toBe(1);
    expect(scores.R).toBe(0);
  });

  it("모르는 옵션 ID는 무시한다", () => {
    const scores = computeScores(["nope"]);
    expect(RIASEC_ORDER.every((t) => scores[t] === 0)).toBe(true);
  });
});

describe("derivePairCode", () => {
  it("최고·차순위 유형을 결합한다", () => {
    const code = derivePairCode({ R: 5, I: 3, A: 7, S: 0, E: 0, C: 0 });
    expect(code).toBe("AR");
  });

  it("동점은 RIASEC 표준 순서로 정렬한다", () => {
    const code = derivePairCode({ R: 2, I: 2, A: 0, S: 0, E: 0, C: 0 });
    expect(code).toBe("RI");
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `npm test -- lib/scoring.test.ts`
Expected: FAIL — `scoring.ts` 모듈/함수 미정의.

- [ ] **Step 6: 구현**

Create `lib/scoring.ts`:
```ts
import { mockQuestions, type RiasecType } from "@/lib/mock/questions";

export const RIASEC_ORDER: RiasecType[] = ["R", "I", "A", "S", "E", "C"];

// 선택지 ID → 옵션 역조회 맵 (모듈 로드 시 1회 구성)
const optionById = new Map(
  mockQuestions
    .flatMap((q) => q.options ?? [])
    .map((opt) => [opt.id, opt] as const),
);

export function computeScores(
  selectedOptionIds: string[],
): Record<RiasecType, number> {
  const scores = Object.fromEntries(
    RIASEC_ORDER.map((t) => [t, 0]),
  ) as Record<RiasecType, number>;

  for (const id of selectedOptionIds) {
    const opt = optionById.get(id);
    if (!opt) continue;
    scores[opt.primary] += 2;
    if (opt.secondary) scores[opt.secondary] += 1;
  }
  return scores;
}

export function derivePairCode(scores: Record<RiasecType, number>): string {
  const ranked = [...RIASEC_ORDER].sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return RIASEC_ORDER.indexOf(a) - RIASEC_ORDER.indexOf(b);
  });
  return ranked[0] + ranked[1];
}
```

- [ ] **Step 7: 통과 확인**

Run: `npm test -- lib/scoring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: 커밋**

```bash
git add vitest.config.ts package.json package-lock.json lib/scoring.ts lib/scoring.test.ts
git commit -m "feat(scoring): RIASEC 점수·Pair Code 산출 + vitest 인프라"
```

---

### Task 2: Q7-A 정적 선택지 데이터

**Files:**
- Create: `lib/mock/q7a.ts`
- Test: `lib/mock/q7a.test.ts`

**Interfaces:**
- Consumes: `RIASEC_ORDER` from `@/lib/scoring` (테스트에서 30개 코드 생성 검증).
- Produces:
  - `interface Q7AOption { id: string; label: string }`
  - `q7aOptionsByPairCode: Record<string, Q7AOption[]>`
  - `getQ7AOptions(pairCode: string): Q7AOption[]`

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/mock/q7a.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { q7aOptionsByPairCode, getQ7AOptions } from "./q7a";
import { RIASEC_ORDER } from "@/lib/scoring";

describe("q7aOptionsByPairCode", () => {
  it("30개 Pair Code(순서쌍)를 모두 포함한다", () => {
    const expected: string[] = [];
    for (const a of RIASEC_ORDER)
      for (const b of RIASEC_ORDER) if (a !== b) expected.push(a + b);
    expect(Object.keys(q7aOptionsByPairCode).sort()).toEqual(expected.sort());
  });

  it("각 Pair Code는 6개 선택지를 가진다", () => {
    for (const opts of Object.values(q7aOptionsByPairCode)) {
      expect(opts).toHaveLength(6);
    }
  });

  it("모든 선택지 ID는 전역적으로 고유하다", () => {
    const ids = Object.values(q7aOptionsByPairCode).flatMap((o) =>
      o.map((x) => x.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getQ7AOptions는 해당 코드의 선택지를 반환한다", () => {
    expect(getQ7AOptions("AI")).toHaveLength(6);
    expect(getQ7AOptions("AI")[0].label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- lib/mock/q7a.test.ts`
Expected: FAIL — 모듈 미정의.

- [ ] **Step 3: 데이터 구현 (소스 전사)**

Create `lib/mock/q7a.ts`. 소스 "나비한마당 Q7-A Pair Code별 학생용 선택지 워딩 수정본.txt"의 30개 Pair × 6 문구를 그대로 전사한다. ID 형식 `q7a-<paircode소문자>-<n>`. 아래는 형식 예시(첫 두 코드) — **나머지 28개 코드도 동일 형식으로 소스에서 빠짐없이 전사할 것.**

```ts
export interface Q7AOption {
  id: string;
  label: string;
}

// 소스: Q7-A Pair Code별 학생용 선택지 워딩 수정본
// 학생용 문구만 보관. 백엔드 분야/직업풀은 Q7-B 생성 시 LLM이 추론한다.
export const q7aOptionsByPairCode: Record<string, Q7AOption[]> = {
  RI: [
    { id: "q7a-ri-1", label: "장비가 움직이는 원리를 살피는 구역" },
    { id: "q7a-ri-2", label: "숲과 지형의 단서를 찾아보는 구역" },
    { id: "q7a-ri-3", label: "도구로 문제의 원인을 확인하는 구역" },
    { id: "q7a-ri-4", label: "몸의 움직임을 과학적으로 살피는 구역" },
    { id: "q7a-ri-5", label: "위험 신호를 먼저 읽어내는 구역" },
    { id: "q7a-ri-6", label: "실험 도구의 쓰임을 시험하는 구역" },
  ],
  RA: [
    { id: "q7a-ra-1", label: "손끝의 아이디어를 실제로 만드는 구역" },
    { id: "q7a-ra-2", label: "공간의 분위기를 새롭게 바꾸는 구역" },
    { id: "q7a-ra-3", label: "빛과 소리로 장면을 만드는 구역" },
    { id: "q7a-ra-4", label: "입고 쓰는 물건을 새롭게 꾸미는 구역" },
    { id: "q7a-ra-5", label: "디지털 감각을 체험으로 만드는 구역" },
    { id: "q7a-ra-6", label: "자연 속 장비와 도구를 다루는 구역" },
  ],
  // … RS, RE, RC, IR, IA, IS, IE, IC, AR, AI, AS, AE, AC,
  //    SR, SI, SA, SE, SC, ER, EI, EA, ES, EC, CR, CI, CA, CS, CE
  //    (소스의 각 ## 헤더 = Pair Code, 그 아래 1~6 = 선택지 순서대로 전사)
};

export function getQ7AOptions(pairCode: string): Q7AOption[] {
  return q7aOptionsByPairCode[pairCode] ?? [];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- lib/mock/q7a.test.ts`
Expected: PASS (4 tests). 실패 시 누락된 코드/선택지 수를 소스와 대조해 보완.

- [ ] **Step 5: 커밋**

```bash
git add lib/mock/q7a.ts lib/mock/q7a.test.ts
git commit -m "feat(q7a): Pair Code별 정적 선택지 데이터(30×6) 전사"
```

---

### Task 3: 세션 스토어 확장

**Files:**
- Modify: `store/useSessionStore.ts`

**Interfaces:**
- Consumes: `RiasecType` from `@/lib/mock/questions`, `Q7AOption` from `@/lib/mock/q7a`.
- Produces (스토어 신규 필드/세터, 다른 task가 사용):
  - 타입: `Q7BOption`, `Q8Chip`, `Q9Chip`, `NameCard`
  - 상태: `riasecScores`, `pairCode`, `q7aSelection`, `q7bSelection`, `q8Selection`, `q9Selection`, `q10Selection`
  - 세터: `setRiasec`, `setQ7aSelection`, `setQ7bSelection`, `setQ8Selection`, `setQ9Selection`, `setQ10Selection`

- [ ] **Step 1: 타입·상태·세터 추가**

Modify `store/useSessionStore.ts`. `import` 구역에 추가:
```ts
import type { RiasecType } from "@/lib/mock/questions";
import type { Q7AOption } from "@/lib/mock/q7a";
```

`PersonaResult` 인터페이스 아래에 신규 타입 추가:
```ts
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
```

`SessionStore` 인터페이스 안 `cardId: string | null;` 줄 아래에 상태 필드 추가:
```ts
  riasecScores: Record<RiasecType, number> | null;
  pairCode: string | null;
  q7aSelection: { first: Q7AOption; second: Q7AOption } | null;
  q7bSelection: { first: Q7BOption; second: Q7BOption } | null;
  q8Selection: { chips: Q8Chip[]; freeText: string } | null;
  q9Selection: { chips: Q9Chip[]; freeText: string } | null;
  q10Selection: NameCard | null;
```

`SessionStore` 인터페이스 안 `setCardId` 줄 아래에 세터 시그니처 추가:
```ts
  setRiasec: (scores: Record<RiasecType, number>, pairCode: string) => void;
  setQ7aSelection: (sel: { first: Q7AOption; second: Q7AOption }) => void;
  setQ7bSelection: (sel: { first: Q7BOption; second: Q7BOption }) => void;
  setQ8Selection: (sel: { chips: Q8Chip[]; freeText: string }) => void;
  setQ9Selection: (sel: { chips: Q9Chip[]; freeText: string }) => void;
  setQ10Selection: (card: NameCard) => void;
```

`create<SessionStore>` 초기값에서 `cardId: null,` 아래에 추가:
```ts
  riasecScores: null,
  pairCode: null,
  q7aSelection: null,
  q7bSelection: null,
  q8Selection: null,
  q9Selection: null,
  q10Selection: null,
```

`setCardId` 구현 아래에 세터 구현 추가:
```ts
  setRiasec: (scores, pairCode) => set({ riasecScores: scores, pairCode }),
  setQ7aSelection: (sel) => set({ q7aSelection: sel }),
  setQ7bSelection: (sel) => set({ q7bSelection: sel }),
  setQ8Selection: (sel) => set({ q8Selection: sel }),
  setQ9Selection: (sel) => set({ q9Selection: sel }),
  setQ10Selection: (card) => set({ q10Selection: card }),
```

`reset`의 `set({ ... })` 객체에 신규 필드 초기화 추가(기존 필드 뒤):
```ts
      riasecScores: null,
      pairCode: null,
      q7aSelection: null,
      q7bSelection: null,
      q8Selection: null,
      q9Selection: null,
      q10Selection: null,
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add store/useSessionStore.ts
git commit -m "feat(store): Q7~Q10 단계 선택 상태/세터 추가"
```

---

### Task 4: OpenRouter 호출 래퍼

**Files:**
- Create: `lib/openrouter.ts`
- Test: `lib/openrouter.test.ts`

**Interfaces:**
- Produces:
  - `class OpenRouterError extends Error { code: "MISSING_KEY" | "GENERATION_FAILED" }`
  - `interface ChatMessage { role: "system" | "user"; content: string }`
  - `chatJSON(messages: ChatMessage[]): Promise<unknown>`

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/openrouter.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatJSON, OpenRouterError } from "./openrouter";

describe("chatJSON", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("키가 없으면 MISSING_KEY로 throw한다", async () => {
    await expect(chatJSON([{ role: "user", content: "hi" }])).rejects.toMatchObject(
      { code: "MISSING_KEY" },
    );
  });

  it("성공 시 content를 JSON 파싱해 반환한다", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"q8":{"ok":true}}' } }],
        }),
      }),
    );
    const out = await chatJSON([{ role: "user", content: "go" }]);
    expect(out).toEqual({ q8: { ok: true } });
  });

  it("비2xx면 GENERATION_FAILED로 throw한다", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" }),
    );
    await expect(chatJSON([{ role: "user", content: "go" }])).rejects.toMatchObject(
      { code: "GENERATION_FAILED" },
    );
  });

  it("OpenRouterError는 instanceof Error", () => {
    expect(new OpenRouterError("MISSING_KEY") instanceof Error).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- lib/openrouter.test.ts`
Expected: FAIL — 모듈 미정의.

- [ ] **Step 3: 구현**

Create `lib/openrouter.ts`:
```ts
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.4-mini";

export type OpenRouterErrorCode = "MISSING_KEY" | "GENERATION_FAILED";

export class OpenRouterError extends Error {
  code: OpenRouterErrorCode;
  constructor(code: OpenRouterErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OpenRouterError";
    this.code = code;
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function chatJSON(messages: ChatMessage[]): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("MISSING_KEY", "OPENROUTER_API_KEY 미설정");

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "naBe-persona",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
  } catch (e) {
    throw new OpenRouterError("GENERATION_FAILED", `요청 실패: ${String(e)}`);
  }

  if (!res.ok) {
    throw new OpenRouterError("GENERATION_FAILED", `OpenRouter ${res.status}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = await res.json();
  } catch {
    throw new OpenRouterError("GENERATION_FAILED", "응답 JSON 파싱 실패");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError("GENERATION_FAILED", "빈 응답");

  try {
    return JSON.parse(content);
  } catch {
    throw new OpenRouterError("GENERATION_FAILED", "생성 JSON 파싱 실패");
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- lib/openrouter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/openrouter.ts lib/openrouter.test.ts
git commit -m "feat(openrouter): OpenRouter chatJSON 래퍼 + 에러 타입"
```

---

### Task 5: 프롬프트 빌더 + stage 실행기

**Files:**
- Create: `lib/prompts/q7b.ts`, `lib/prompts/q8.ts`, `lib/prompts/q9.ts`, `lib/prompts/q10.ts`
- Create: `lib/generate.ts`
- Test: `lib/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `@/lib/openrouter`; 스토어 타입 `Q7BOption`, `Q8Chip`, `Q9Chip`.
- Produces:
  - 각 빌더: `buildQ7BMessages(input): ChatMessage[]` 등. `input`은 `GenerateInput`(아래) 의 부분집합 사용.
  - `lib/generate.ts`:
    - `type Stage = "q7b" | "q8" | "q9" | "q10"`
    - `interface GenerateInput { riasecScores: Record<string, number>; pairCode: string; q1to6: string[]; q7aFirst: string; q7aSecond: string; q7bFirst?: unknown; q7bSecond?: unknown; q8?: unknown; q9?: unknown; careerPool?: string[] }`
    - `runStage(stage: Stage, input: GenerateInput): Promise<unknown>` — 빌더 선택 → `chatJSON` → 최상위 키 검증.

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/prompts/prompts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildQ7BMessages } from "./q7b";
import { buildQ10Messages } from "./q10";

const base = {
  riasecScores: { R: 2, I: 1, A: 6, S: 0, E: 1, C: 4 },
  pairCode: "AC",
  q1to6: ["q1-a", "q3-c"],
  q7aFirst: "감각을 손에 잡히는 물건으로 만드는 구역",
  q7aSecond: "정보를 보기 좋게 정돈하는 구역",
};

describe("buildQ7BMessages", () => {
  it("Pair Code와 Q7-A 선택을 프롬프트에 주입한다", () => {
    const msgs = buildQ7BMessages(base);
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("AC");
    expect(joined).toContain("감각을 손에 잡히는 물건으로 만드는 구역");
    expect(joined).toContain('"q7b"'); // 출력 스키마 키 안내 포함
  });
  it("system + user 두 역할을 만든다", () => {
    const msgs = buildQ7BMessages(base);
    expect(msgs.map((m) => m.role).sort()).toEqual(["system", "user"]);
  });
});

describe("buildQ10Messages", () => {
  it("이름 후보 3개 스키마 키를 안내한다", () => {
    const msgs = buildQ10Messages({
      ...base,
      q8: { chips: [{ text: "먼저 움직여 길을 여는" }], freeText: "" },
      q9: { chips: [{ text: "도시 속 숨은 불편함" }], freeText: "" },
      careerPool: ["UX디자이너"],
    });
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain('"name_cards"');
    expect(joined).toContain("도시 속 숨은 불편함");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- lib/prompts/prompts.test.ts`
Expected: FAIL — 모듈 미정의.

- [ ] **Step 3: Q7-B 빌더 구현**

Create `lib/prompts/q7b.ts`. 소스 "Q7-B 프롬프트.txt"를 시스템 지침으로 쓰되, Q7-A 백엔드 분야가 없으므로 **"학생이 고른 Q7-A 문구와 Pair Code로부터 backend_field/subfields/career_pool을 먼저 추론한 뒤 생성하라"** 지침을 추가한다.
```ts
import type { ChatMessage } from "@/lib/openrouter";

interface Q7BInput {
  riasecScores: Record<string, number>;
  pairCode: string;
  q7aFirst: string;
  q7aSecond: string;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q7-B 세부분야 선택 문항을 생성한다. 학생은 나비섬 탐험을 마친 뒤
고른 탐험 구역 안에서 더 깊이 들어가볼 "세부 탐험길"을 고른다.

중요한 표현 원칙:
1. 학생용 선택지는 직업명/산업명/전공명처럼 보이면 안 된다.
2. "시제품","사업화","품질관리","데이터분석","마케팅","컨설팅","프로토타입",
   "컴플라이언스" 같은 전문 용어를 student_title/description에 직접 쓰지 않는다.
3. 전문 용어는 backend_subfield 또는 career_pool에만 넣는다.
4. 학생용 선택지는 "~하는 길","~을 살피는 길","~을 보여주는 길","~을 연결하는 길"
   형태로 탐험 상황에 어울리게 쓴다. 너무 유치하거나 판타지스럽지 않게.
5. Q7-A 1순위 분야를 더 많이 반영하되 2순위도 섞는다.
6. 학생용에는 RIASEC/Pair Code/점수/직업군을 노출하지 않는다.

추가 지침(중요):
- Q7-A 선택의 backend_field/backend_subfields/career_pool 데이터는 주어지지 않는다.
  학생이 고른 Q7-A 문구와 Pair Code로부터 적절한 backend_field와 career_pool을
  스스로 추론한 뒤, 그 분야 기반으로 선택지를 생성하라.

생성 조건:
- 선택지는 총 10개. 학생은 10개 중 1순위와 2순위를 고른다.
- 각 선택지는 학생용 표현과 백엔드 데이터를 분리해 출력한다.
- 10개 선택지의 길이와 매력도를 비슷하게, 같은 의미 반복 금지.

반드시 아래 JSON 스키마로만 출력한다(설명 텍스트 금지):
{"q7b":{"title":"선택한 탐험 구역 안에서 더 깊이 들어가보고 싶은 길은?",
"intro":"방금 고른 구역 안에는 더 자세히 들어가볼 수 있는 길들이 열려 있습니다. 가장 끌리는 길을 1순위와 2순위로 골라주세요.",
"selection_rule":"10개 중 1순위와 2순위 선택",
"options":[{"subfield_id":"SUB_01","student_title":"","student_description":"",
"backend_subfield":"","backend_keywords":[],"career_pool":[],"persona_material_keywords":[]}]}}`;

export function buildQ7BMessages(input: Q7BInput): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q7-A 1순위 선택(학생 문구): ${input.q7aFirst}
Q7-A 2순위 선택(학생 문구): ${input.q7aSecond}

위 입력으로 Q7-B 10개 선택지를 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 4: Q8 빌더 구현**

Create `lib/prompts/q8.ts`:
```ts
import type { ChatMessage } from "@/lib/openrouter";

interface Q8Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q8 태도 질문을 생성한다. 학생이 선택한 탐험길을 어떤 방식·태도·마음가짐으로
이어가고 싶은지 확인한다. 이 응답은 최종 페르소나 이름의 수식어/동사/분위기 재료다.

학생용 표현 원칙:
1. 탐험 이후 이어지는 장면처럼 쓴다.
2. "태도","직업","업무","역량","산업","전문가" 표현은 피한다.
3. "탐험길","단서","흐름","신호","사람","공간","장면","변화","이야기" 같은 표현 활용.
4. 단어칩(text)은 "~하는","~을 살피는","~을 이어가는","~을 바꾸는","~을 보여주는",
   "~을 지켜보는"처럼 페르소나 이름에 쓸 수 있는 형태로.
5. 전문 용어 금지(예: "데이터를 분석하는"→"숨은 흐름을 읽는").
6. 짧고 명확하게. RIASEC/Pair Code/점수/직업군 비노출.
7. backend(why_generated_backend)에는 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q8":{"title":"내가 고른 탐험길을 어떤 방식으로 이어가고 싶을까?",
"intro":"지금까지의 선택을 바탕으로, 당신이 이 탐험길을 이어가는 방식에 어울릴 만한 표현들이 열렸습니다.",
"answer_type":"word_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 나답다고 느껴지는 표현을 골라주세요.",
"word_chips":[{"chip_id":"ATT_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 원하는 표현을 직접 써도 좋아요."}}`;

export function buildQ8Messages(input: Q8Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 로그: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}

위 입력으로 Q8 단어칩을 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 5: Q9 빌더 구현**

Create `lib/prompts/q9.ts`:
```ts
import type { ChatMessage } from "@/lib/openrouter";

interface Q9Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q9 관심 대상/주제 질문을 생성한다. 학생이 선택한 탐험길에서 무엇을 더
살펴보고 싶은지, 그 길이 누구에게 닿으면 좋겠는지 확인한다. 이 응답은 최종
페르소나 이름의 "대상" 표현 재료다. 관심 주제는 고정 목록이 아니라 Q1~Q8을
바탕으로 생성한다.

학생용 표현 원칙:
1. 탐험 이후 장면처럼, 쉽게 묻는다("더 살펴보고 싶은 것","마음이 가는 장면",
   "도움이 닿았으면 하는 대상","바꾸고 싶은 불편함").
2. "문제의식","가치관","사회적 의제","직업 분야" 같은 딱딱한 표현 금지.
3. 주제칩(text)은 최종 이름의 대상이 될 만큼 구체적으로.
4. 전문 용어 금지(예: "환경보호"→"숲과 동물의 안전","접근성"→"누구나 이해하기 쉬운 안내").
5. 짧고 구체적으로. RIASEC/Pair Code/점수/직업군 비노출.
6. backend(why_generated_backend)에 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q9":{"title":"이 탐험길에서 가장 더 살펴보고 싶은 것은 무엇일까?",
"intro":"당신이 고른 탐험길 안에서 특히 마음이 가는 대상이나 장면을 골라주세요.",
"answer_type":"topic_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 마음이 가는 표현을 골라주세요.",
"topic_chips":[{"chip_id":"TOPIC_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 더 관심 있는 대상을 직접 써도 좋아요."}}`;

export function buildQ9Messages(input: Q9Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 로그: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}
Q8 선택: ${JSON.stringify(input.q8 ?? null)}

위 입력으로 Q9 주제칩을 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 6: Q10 빌더 구현**

Create `lib/prompts/q10.ts`:
```ts
import type { ChatMessage } from "@/lib/openrouter";

interface Q10Input {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
  q9?: unknown;
  careerPool?: string[];
}

const SYSTEM = `너는 중·고등학생 대상 진로 페르소나 카드의 이름을 만드는 작명가이자
진로 콘텐츠 기획자다.

과업: 학생에게 제시할 최종 진로 페르소나 이름 후보 3개를 생성한다.
Q1~Q9는 나비섬 탐험 형식이었지만 Q10에서는 현실 진로 페르소나 이름으로 전환한다.
이름은 실제 진로·직업·역할과 연결되는 현실적 이름이어야 한다.

생성 조건:
1. 이름에 "나비섬","탐험","탐험가","미션","구역","탐험길" 같은 세계관 표현 금지.
2. Pair Code/RIASEC 유형명/점수를 이름에 직접 노출 금지.
3. 직업군은 참고하되 특정 직업을 강하게 단정하지 않는다.
4. "현실에서 있을 법한 역할형 페르소나"처럼. 너무 추상적/유치/과장 금지.
5. Q8/Q9 직접 입력이 있으면 우선 반영.
6. 후보 3개는 서로 충분히 다르고 강조점이 다르다.
   1안: 관심 대상 중심 / 2안: 태도·방식 중심 / 3안: 분야·역할 중심.
7. 각 후보에 중·고등학생이 이해할 한 줄 설명.
8. 이름 구조 예: "[대상]을 [태도/방식]하는 [역할명]" 등.
좋은 예: 숲을 지키는 드론전문가, 감정을 번역하는 콘텐츠 기획자,
도시의 빈틈을 설계하는 공간기획자.
피할 예: 나비섬 탐험가, 미션 해결 전문가, RA형 제작 창작자, 미래를 여는 융합형 인재.

반드시 아래 JSON 스키마로만 출력한다:
{"q10":{"title":"당신의 나Be 페르소나 이름을 골라주세요",
"intro":"지금까지의 선택을 바탕으로 3개의 진로 페르소나 이름이 만들어졌습니다. 가장 마음에 드는 이름을 하나 선택해주세요.",
"selection_rule":"3개 중 1개 선택",
"name_cards":[{"name_id":"NAME_01","persona_name":"","short_description":"",
"emphasis":"관심 대상 중심","materials_used_backend":{"pair_code":"","field":"",
"subfield":"","attitude":"","topic":"","career_reference":""}},
{"name_id":"NAME_02","persona_name":"","short_description":"","emphasis":"태도/방식 중심","materials_used_backend":{}},
{"name_id":"NAME_03","persona_name":"","short_description":"","emphasis":"분야/역할 중심","materials_used_backend":{}}]}}`;

export function buildQ10Messages(input: Q10Input): ChatMessage[] {
  const user = `RIASEC 전체 점수: ${JSON.stringify(input.riasecScores)}
Pair Code: ${input.pairCode}
Q1~Q6 선택 요약: ${JSON.stringify(input.q1to6)}
Q7-A 1순위: ${input.q7aFirst}
Q7-A 2순위: ${input.q7aSecond}
Q7-B 1순위: ${JSON.stringify(input.q7bFirst ?? null)}
Q7-B 2순위: ${JSON.stringify(input.q7bSecond ?? null)}
Q7 career_pool 참고: ${JSON.stringify(input.careerPool ?? [])}
Q8 선택/직접입력: ${JSON.stringify(input.q8 ?? null)}
Q9 선택/직접입력: ${JSON.stringify(input.q9 ?? null)}

위 입력으로 페르소나 이름 후보 3개를 생성해 JSON으로만 출력하라.`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 7: stage 실행기 구현**

Create `lib/generate.ts`:
```ts
import { chatJSON } from "@/lib/openrouter";
import { buildQ7BMessages } from "@/lib/prompts/q7b";
import { buildQ8Messages } from "@/lib/prompts/q8";
import { buildQ9Messages } from "@/lib/prompts/q9";
import { buildQ10Messages } from "@/lib/prompts/q10";

export type Stage = "q7b" | "q8" | "q9" | "q10";

export interface GenerateInput {
  riasecScores: Record<string, number>;
  pairCode: string;
  q1to6: string[];
  q7aFirst: string;
  q7aSecond: string;
  q7bFirst?: unknown;
  q7bSecond?: unknown;
  q8?: unknown;
  q9?: unknown;
  careerPool?: string[];
}

const BUILDERS = {
  q7b: buildQ7BMessages,
  q8: buildQ8Messages,
  q9: buildQ9Messages,
  q10: buildQ10Messages,
} as const;

export function isStage(v: string): v is Stage {
  return v in BUILDERS;
}

export async function runStage(stage: Stage, input: GenerateInput): Promise<unknown> {
  const messages = BUILDERS[stage](input);
  const result = await chatJSON(messages);
  // 최상위 키(stage) 존재만 가볍게 검증
  if (
    typeof result !== "object" ||
    result === null ||
    !(stage in (result as Record<string, unknown>))
  ) {
    const { OpenRouterError } = await import("@/lib/openrouter");
    throw new OpenRouterError("GENERATION_FAILED", `${stage} 키 누락`);
  }
  return result;
}
```

- [ ] **Step 8: 통과 확인**

Run: `npm test -- lib/prompts/prompts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: 전체 테스트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 없음.

- [ ] **Step 10: 커밋**

```bash
git add lib/prompts/ lib/generate.ts
git commit -m "feat(prompts): Q7-B/Q8/Q9/Q10 프롬프트 빌더 + stage 실행기"
```

---

### Task 6: 생성 API 라우트 (동적 stage)

**Files:**
- Create: `app/api/generate/[stage]/route.ts`
- Modify: `.env.local.example`, `.env.local`

**Interfaces:**
- Consumes: `runStage`, `isStage`, `GenerateInput` from `@/lib/generate`; `OpenRouterError` from `@/lib/openrouter`.
- Produces: `POST /api/generate/{stage}` — 본문 `GenerateInput`, 응답 생성 JSON 또는 `{ error, code }`.

> 설계 정제: 스펙의 "4개 라우트"를 DRY하게 단일 동적 라우트 `[stage]`로 통합한다(허용 stage 화이트리스트). 동작은 동일.

- [ ] **Step 1: 환경변수 예시 추가**

Modify `.env.local.example` — 끝에 추가:
```
# OpenRouter (서버 전용 — NEXT_PUBLIC 금지)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.4-mini
```

Modify `.env.local` — 동일 두 줄 추가(키 값은 비워 둠; 사용자가 채움):
```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.4-mini
```

- [ ] **Step 2: 라우트 핸들러 작성**

Create `app/api/generate/[stage]/route.ts`:
```ts
import { runStage, isStage, type GenerateInput } from "@/lib/generate";
import { OpenRouterError } from "@/lib/openrouter";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stage: string }> },
) {
  const { stage } = await params;
  if (!isStage(stage)) {
    return Response.json(
      { error: "알 수 없는 단계입니다.", code: "BAD_STAGE" },
      { status: 404 },
    );
  }

  let body: GenerateInput;
  try {
    body = (await request.json()) as GenerateInput;
  } catch {
    return Response.json(
      { error: "잘못된 요청입니다.", code: "BAD_BODY" },
      { status: 400 },
    );
  }

  try {
    const result = await runStage(stage, body);
    return Response.json(result);
  } catch (e) {
    if (e instanceof OpenRouterError) {
      const status = e.code === "MISSING_KEY" ? 400 : 502;
      return Response.json({ error: e.message, code: e.code }, { status });
    }
    return Response.json(
      { error: "서버 오류", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: 빌드로 라우트 컴파일 검증**

Run: `npm run build`
Expected: 빌드 성공. 출력 라우트 목록에 `/api/generate/[stage]` 포함.

- [ ] **Step 4: 키 없음 동작 수동 확인**

`.env.local`의 `OPENROUTER_API_KEY`가 빈 상태에서:
Run:
```bash
npm run dev &  # 별도 셸 사용 가능
sleep 4
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/generate/q8 \
  -H 'Content-Type: application/json' \
  -d '{"riasecScores":{"A":6},"pairCode":"AC","q1to6":[],"q7aFirst":"x","q7aSecond":"y"}'
```
Expected: `400` (MISSING_KEY). 확인 후 dev 서버 종료.

- [ ] **Step 5: 커밋**

```bash
git add app/api/generate/ .env.local.example
git commit -m "feat(api): 생성 단계 동적 라우트 + OpenRouter 환경변수"
```
(주의: `.env.local`은 git 추적 대상이 아니면 커밋하지 않는다 — `git status`로 확인.)

---

### Task 7: 프레젠테이셔널 컴포넌트

**Files:**
- Create: `components/explore/RankSelect.tsx`
- Create: `components/explore/ChipSelect.tsx`
- Create: `components/explore/NameCardSelect.tsx`
- Create: `components/explore/GeneratingScreen.tsx`

**Interfaces:**
- Produces (오케스트레이터가 사용):
  - `RankSelect`: props `{ options: { id: string; label: string; description?: string }[]; first: string | null; second: string | null; onChange: (first: string | null, second: string | null) => void }`
  - `ChipSelect`: props `{ chips: { id: string; text: string }[]; selectedIds: string[]; freeText: string; placeholder: string; onToggle: (id: string) => void; onFreeText: (v: string) => void }`
  - `NameCardSelect`: props `{ cards: { id: string; name: string; description: string; emphasis: string }[]; selectedId: string | null; onSelect: (id: string) => void }`
  - `GeneratingScreen`: props `{ error: string | null; onRetry: () => void }`

- [ ] **Step 1: RankSelect 작성**

Create `components/explore/RankSelect.tsx`:
```tsx
"use client";

import { cn } from "@/lib/utils";

interface RankOption {
  id: string;
  label: string;
  description?: string;
}

interface RankSelectProps {
  options: RankOption[];
  first: string | null;
  second: string | null;
  onChange: (first: string | null, second: string | null) => void;
}

export function RankSelect({ options, first, second, onChange }: RankSelectProps) {
  const handleClick = (id: string) => {
    if (id === first) return onChange(null, second);
    if (id === second) return onChange(first, null);
    if (first === null) return onChange(id, second);
    if (second === null) return onChange(first, id);
    // 둘 다 찼으면 2순위 교체
    onChange(first, id);
  };

  const rankOf = (id: string) =>
    id === first ? 1 : id === second ? 2 : null;

  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const rank = rankOf(opt.id);
        const selected = rank !== null;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleClick(opt.id)}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border border-solid p-4 text-left text-base font-medium backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_12px_28px_rgba(124,77,229,0.35)]"
                : "border-white/70 bg-white/80 text-[#2a2550] shadow-[0_10px_30px_rgba(123,97,240,0.1)] hover:scale-[1.01] hover:border-indigo-300",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-solid text-sm font-bold transition-colors",
                selected
                  ? "border-white bg-white/30 text-white"
                  : "border-indigo-300 bg-white/60 text-indigo-400",
              )}
              aria-hidden
            >
              {rank ?? ""}
            </span>
            <span className="flex flex-col">
              <span className="leading-snug">{opt.label}</span>
              {opt.description && (
                <span
                  className={cn(
                    "mt-1 text-sm",
                    selected ? "text-white/80" : "text-[#5b5685]",
                  )}
                >
                  {opt.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: ChipSelect 작성**

Create `components/explore/ChipSelect.tsx`:
```tsx
"use client";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Chip {
  id: string;
  text: string;
}

interface ChipSelectProps {
  chips: Chip[];
  selectedIds: string[];
  freeText: string;
  placeholder: string;
  onToggle: (id: string) => void;
  onFreeText: (v: string) => void;
}

export function ChipSelect({
  chips,
  selectedIds,
  freeText,
  placeholder,
  onToggle,
  onFreeText,
}: ChipSelectProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2.5">
        {chips.map((chip) => {
          const selected = selectedIds.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onToggle(chip.id)}
              className={cn(
                "rounded-full border border-solid px-4 py-2.5 text-sm font-medium backdrop-blur-xl transition-all",
                selected
                  ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_8px_20px_rgba(124,77,229,0.3)]"
                  : "border-white/70 bg-white/80 text-[#2a2550] hover:border-indigo-300",
              )}
            >
              {chip.text}
            </button>
          );
        })}
      </div>
      <Textarea
        value={freeText}
        onChange={(e) => onFreeText(e.target.value)}
        placeholder={placeholder}
        className="min-h-[90px] rounded-xl border border-solid border-white/70 bg-white/80 p-4 text-base shadow-[0_10px_30px_rgba(123,97,240,0.1)] backdrop-blur-xl focus-visible:ring-indigo-500"
      />
    </div>
  );
}
```

- [ ] **Step 3: NameCardSelect 작성**

Create `components/explore/NameCardSelect.tsx`:
```tsx
"use client";

import { cn } from "@/lib/utils";

interface NameCardItem {
  id: string;
  name: string;
  description: string;
  emphasis: string;
}

interface NameCardSelectProps {
  cards: NameCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function NameCardSelect({ cards, selectedId, onSelect }: NameCardSelectProps) {
  return (
    <div className="flex flex-col gap-4">
      {cards.map((card) => {
        const selected = card.id === selectedId;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={cn(
              "flex w-full flex-col gap-2 rounded-2xl border border-solid p-5 text-left backdrop-blur-xl transition-all",
              selected
                ? "border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_14px_30px_rgba(124,77,229,0.4)]"
                : "border-white/70 bg-white/80 text-[#2a2550] shadow-[0_10px_30px_rgba(123,97,240,0.1)] hover:scale-[1.01] hover:border-indigo-300",
            )}
          >
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-widest",
                selected ? "text-white/80" : "text-indigo-400",
              )}
            >
              {card.emphasis}
            </span>
            <span className="text-xl font-extrabold leading-tight">{card.name}</span>
            <span className={cn("text-sm", selected ? "text-white/85" : "text-[#5b5685]")}>
              {card.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: GeneratingScreen 작성**

Create `components/explore/GeneratingScreen.tsx`:
```tsx
"use client";

import { motion } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratingScreenProps {
  error: string | null;
  onRetry: () => void;
}

export function GeneratingScreen({ error, onRetry }: GeneratingScreenProps) {
  if (error) {
    return (
      <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
        <AlertCircle className="h-12 w-12 text-rose-400" />
        <p className="max-w-sm text-lg font-bold text-[#2a2550]">{error}</p>
        <Button
          size="lg"
          onClick={onRetry}
          className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-8 font-bold text-white"
        >
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-5 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      >
        <Loader2 className="h-12 w-12 text-indigo-500" />
      </motion.div>
      <p className="text-lg font-bold text-[#2a2550]">
        선택을 바탕으로 다음 탐험길을 준비하고 있어요…
      </p>
    </div>
  );
}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`components/ui/textarea`, `button` 존재 전제 — 기존 사용 확인됨.)

- [ ] **Step 6: 커밋**

```bash
git add components/explore/
git commit -m "feat(explore): 단계 선택/로딩 프레젠테이셔널 컴포넌트"
```

---

### Task 8: 오케스트레이터 페이지 + 플로우 연결

**Files:**
- Create: `app/explore/path/page.tsx`
- Modify: `app/explore/questions/page.tsx` (다음 경로 + 점수 산출)

**Interfaces:**
- Consumes: `computeScores`/`derivePairCode` from `@/lib/scoring`; `getQ7AOptions` from `@/lib/mock/q7a`; 스토어 상태/세터; `RankSelect`/`ChipSelect`/`NameCardSelect`/`GeneratingScreen`.

- [ ] **Step 1: Q1~6 완료 시 점수 산출 + 경로 변경**

Modify `app/explore/questions/page.tsx`. `handleNext`의 else 분기(`router.push("/explore/interpreting")`)를 점수 산출 후 `/explore/path`로 변경한다. 파일 상단 import에 추가:
```tsx
import { computeScores, derivePairCode } from "@/lib/scoring";
```
스토어에서 세터 가져오기(컴포넌트 상단, `addAnswer` 옆):
```tsx
  const setRiasec = useSessionStore((state) => state.setRiasec);
  const answers = useSessionStore((state) => state.answers);
```
`handleNext`를 아래로 교체:
```tsx
  const handleNext = () => {
    let nextAnswers = answers;
    if (currentAnswer.trim().length > 0) {
      const answer = { questionId: currentQuestion.id, value: currentAnswer };
      addAnswer(answer);
      nextAnswers = [...answers, answer];
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer("");
    } else {
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 생성형 단계로 이동
      const optionIds = nextAnswers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string");
      const scores = computeScores(optionIds);
      setRiasec(scores, derivePairCode(scores));
      router.push("/explore/path");
    }
  };
```

- [ ] **Step 2: 오케스트레이터 페이지 작성**

Create `app/explore/path/page.tsx`:
```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { getQ7AOptions } from "@/lib/mock/q7a";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";
import { RankSelect } from "@/components/explore/RankSelect";
import { ChipSelect } from "@/components/explore/ChipSelect";
import { NameCardSelect } from "@/components/explore/NameCardSelect";
import { GeneratingScreen } from "@/components/explore/GeneratingScreen";
import type {
  Q7BOption,
  Q8Chip,
  Q9Chip,
  NameCard,
} from "@/store/useSessionStore";

type Stage = "q7a" | "q7b" | "q8" | "q9" | "q10";
const STAGE_INDEX: Record<Stage, number> = { q7a: 7, q7b: 8, q8: 8, q9: 9, q10: 10 };

interface Q7BData {
  title: string;
  intro: string;
  options: Q7BOption[];
}
interface Q8Data {
  title: string;
  intro: string;
  student_prompt: string;
  word_chips: (Q8Chip & { why_generated_backend?: string })[];
  free_text_placeholder: string;
}
interface Q9Data {
  title: string;
  intro: string;
  student_prompt: string;
  topic_chips: Q9Chip[];
  free_text_placeholder: string;
}
interface Q10Data {
  title: string;
  intro: string;
  name_cards: (NameCard & {
    materials_used_backend?: { field?: string; career_reference?: string };
  })[];
}

export default function PathPage() {
  const router = useRouter();
  const store = useSessionStore();
  const {
    riasecScores,
    pairCode,
    answers,
    setQ7aSelection,
    setQ7bSelection,
    setQ8Selection,
    setQ9Selection,
    setQ10Selection,
    setPersona,
  } = store;

  const [stage, setStage] = useState<Stage>("q7a");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계별 생성 데이터
  const [q7bData, setQ7bData] = useState<Q7BData | null>(null);
  const [q8Data, setQ8Data] = useState<Q8Data | null>(null);
  const [q9Data, setQ9Data] = useState<Q9Data | null>(null);
  const [q10Data, setQ10Data] = useState<Q10Data | null>(null);

  // 진행 중 선택 상태
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [nameId, setNameId] = useState<string | null>(null);

  // pairCode 없으면 비정상 진입 — 처음으로
  useEffect(() => {
    if (!pairCode || !riasecScores) router.replace("/explore");
  }, [pairCode, riasecScores, router]);

  const q1to6 = answers
    .map((a) => a.value)
    .filter((v): v is string => typeof v === "string");

  // 공통: 생성 호출. 마지막 호출 입력을 보관해 "다시 시도"에 재사용.
  const lastReq = useRef<{ stage: string; body: unknown } | null>(null);
  const callGenerate = useCallback(
    async (
      apiStage: "q7b" | "q8" | "q9" | "q10",
      body: unknown,
      onOk: (data: unknown) => void,
    ) => {
      lastReq.current = { stage: apiStage, body };
      setGenerating(true);
      setError(null);
      try {
        const res = await fetch(`/api/generate/${apiStage}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(
            json.code === "MISSING_KEY"
              ? "AI 연결 설정이 필요해요. 잠시 후 다시 시도해주세요."
              : "생성에 실패했어요. 다시 시도해주세요.",
          );
          return;
        }
        onOk(json);
      } catch {
        setError("네트워크 오류예요. 다시 시도해주세요.");
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const resetSelection = () => {
    setFirst(null);
    setSecond(null);
    setChipIds([]);
    setFreeText("");
    setNameId(null);
  };

  const baseInput = {
    riasecScores: riasecScores ?? {},
    pairCode: pairCode ?? "",
    q1to6,
  };

  // Q7-A 확정 → Q7-B 생성
  const submitQ7a = () => {
    const opts = getQ7AOptions(pairCode ?? "");
    const firstOpt = opts.find((o) => o.id === first)!;
    const secondOpt = opts.find((o) => o.id === second)!;
    setQ7aSelection({ first: firstOpt, second: secondOpt });
    callGenerate(
      "q7b",
      { ...baseInput, q7aFirst: firstOpt.label, q7aSecond: secondOpt.label },
      (json) => {
        setQ7bData((json as { q7b: Q7BData }).q7b);
        resetSelection();
        setStage("q7b");
      },
    );
  };

  // Q7-B 확정 → Q8 생성
  const submitQ7b = () => {
    if (!q7bData) return;
    const firstOpt = q7bData.options.find((o) => o.subfield_id === first)!;
    const secondOpt = q7bData.options.find((o) => o.subfield_id === second)!;
    setQ7bSelection({ first: firstOpt, second: secondOpt });
    const a = store.q7aSelection;
    callGenerate(
      "q8",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: firstOpt,
        q7bSecond: secondOpt,
      },
      (json) => {
        setQ8Data((json as { q8: Q8Data }).q8);
        resetSelection();
        setStage("q8");
      },
    );
  };

  // Q8 확정 → Q9 생성
  const submitQ8 = () => {
    if (!q8Data) return;
    const chips = q8Data.word_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ8Selection({ chips, freeText });
    const a = store.q7aSelection;
    const b = store.q7bSelection;
    callGenerate(
      "q9",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: b?.first,
        q7bSecond: b?.second,
        q8: { chips, freeText },
      },
      (json) => {
        setQ9Data((json as { q9: Q9Data }).q9);
        resetSelection();
        setStage("q9");
      },
    );
  };

  // Q9 확정 → Q10 생성
  const submitQ9 = () => {
    if (!q9Data) return;
    const chips = q9Data.topic_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ9Selection({ chips, freeText });
    const a = store.q7aSelection;
    const b = store.q7bSelection;
    const careerPool = [
      ...(b?.first.career_pool ?? []),
      ...(b?.second.career_pool ?? []),
    ];
    callGenerate(
      "q10",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: b?.first,
        q7bSecond: b?.second,
        q8: store.q8Selection,
        q9: { chips, freeText },
        careerPool,
      },
      (json) => {
        setQ10Data((json as { q10: Q10Data }).q10);
        resetSelection();
        setStage("q10");
      },
    );
  };

  // Q10 확정 → persona 매핑 후 결과로
  const submitQ10 = () => {
    if (!q10Data || !nameId) return;
    const card = q10Data.name_cards.find((c) => c.name_id === nameId)!;
    setQ10Selection(card);
    const b = store.q7bSelection;
    setPersona({
      name: card.persona_name,
      tagline: card.short_description,
      keywords: [
        ...(store.q8Selection?.chips.map((c) => c.text) ?? []),
        ...(store.q9Selection?.chips.map((c) => c.text) ?? []),
      ].slice(0, 5),
      fields: [card.materials_used_backend?.field ?? pairCode ?? ""].filter(Boolean),
      recommendedBooths: [
        ...(b?.first.career_pool ?? []),
        ...(b?.second.career_pool ?? []),
      ].slice(0, 3),
    });
    router.push("/explore/interpreting");
  };

  // "다시 시도" — 마지막 생성 요청 재실행
  const retry = () => {
    const req = lastReq.current;
    if (!req) return;
    const apiStage = req.stage as "q7b" | "q8" | "q9" | "q10";
    const onOkMap = {
      q7b: (json: unknown) => {
        setQ7bData((json as { q7b: Q7BData }).q7b);
        resetSelection();
        setStage("q7b");
      },
      q8: (json: unknown) => {
        setQ8Data((json as { q8: Q8Data }).q8);
        resetSelection();
        setStage("q8");
      },
      q9: (json: unknown) => {
        setQ9Data((json as { q9: Q9Data }).q9);
        resetSelection();
        setStage("q9");
      },
      q10: (json: unknown) => {
        setQ10Data((json as { q10: Q10Data }).q10);
        resetSelection();
        setStage("q10");
      },
    };
    callGenerate(apiStage, req.body, onOkMap[apiStage]);
  };

  const toggleChip = (id: string) =>
    setChipIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 2
          ? prev // 최대 2개
          : [...prev, id],
    );

  if (!pairCode || !riasecScores) return null;

  // 현재 단계의 제목/본문/하단버튼 구성
  const rankReady = first !== null && second !== null;
  const chipReady = chipIds.length > 0 || freeText.trim().length > 0;

  const q7aOptions = getQ7AOptions(pairCode);

  let title = "";
  let body: React.ReactNode = null;
  let cta = "";
  let onCta: () => void = () => {};
  let ctaDisabled = false;

  if (stage === "q7a") {
    title = "탐험을 마친 뒤, 더 가보고 싶은 탐험 구역을 1·2순위로 골라주세요.";
    body = (
      <RankSelect
        options={q7aOptions}
        first={first}
        second={second}
        onChange={(f, s) => {
          setFirst(f);
          setSecond(s);
        }}
      />
    );
    cta = "이 구역으로 떠나기";
    onCta = submitQ7a;
    ctaDisabled = !rankReady;
  } else if (stage === "q7b" && q7bData) {
    title = q7bData.title;
    body = (
      <RankSelect
        options={q7bData.options.map((o) => ({
          id: o.subfield_id,
          label: o.student_title,
          description: o.student_description,
        }))}
        first={first}
        second={second}
        onChange={(f, s) => {
          setFirst(f);
          setSecond(s);
        }}
      />
    );
    cta = "이 길로 들어가기";
    onCta = submitQ7b;
    ctaDisabled = !rankReady;
  } else if (stage === "q8" && q8Data) {
    title = q8Data.title;
    body = (
      <ChipSelect
        chips={q8Data.word_chips.map((c) => ({ id: c.chip_id, text: c.text }))}
        selectedIds={chipIds}
        freeText={freeText}
        placeholder={q8Data.free_text_placeholder}
        onToggle={toggleChip}
        onFreeText={setFreeText}
      />
    );
    cta = "다음";
    onCta = submitQ8;
    ctaDisabled = !chipReady;
  } else if (stage === "q9" && q9Data) {
    title = q9Data.title;
    body = (
      <ChipSelect
        chips={q9Data.topic_chips.map((c) => ({ id: c.chip_id, text: c.text }))}
        selectedIds={chipIds}
        freeText={freeText}
        placeholder={q9Data.free_text_placeholder}
        onToggle={toggleChip}
        onFreeText={setFreeText}
      />
    );
    cta = "다음";
    onCta = submitQ9;
    ctaDisabled = !chipReady;
  } else if (stage === "q10" && q10Data) {
    title = q10Data.title;
    body = (
      <NameCardSelect
        cards={q10Data.name_cards.map((c) => ({
          id: c.name_id,
          name: c.persona_name,
          description: c.short_description,
          emphasis: c.emphasis,
        }))}
        selectedId={nameId}
        onSelect={setNameId}
      />
    );
    cta = "이 이름으로 결정하기";
    onCta = submitQ10;
    ctaDisabled = nameId === null;
  }

  const showGenerating = generating || error !== null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      <CelestialBackground variant="soft" />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-grow flex-col px-6 py-8 pt-12">
        <div className="mb-10">
          <Progress
            value={(STAGE_INDEX[stage] / 10) * 100}
            className="mb-3 h-2 overflow-hidden rounded-full border border-solid border-white/70 bg-white/50 [&>div]:bg-gradient-to-r [&>div]:from-indigo-500 [&>div]:to-purple-500"
          />
          <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-[#5b5685]">
            <span>탐험 심화</span>
            <span>{STAGE_INDEX[stage]} / 10</span>
          </div>
        </div>

        {showGenerating ? (
          <GeneratingScreen error={error} onRetry={retry} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-grow flex-col"
            >
              <h2 className="mb-8 text-2xl font-extrabold leading-tight text-[#2a2550] md:text-3xl">
                {title}
              </h2>
              <div className="flex-grow pb-32">{body}</div>
              <div className="sticky bottom-0 z-10 -mx-6 flex justify-center bg-gradient-to-t from-[#fdefe3] via-[#fdefe3]/80 to-transparent p-6 pb-8">
                <Button
                  size="lg"
                  onClick={onCta}
                  disabled={ctaDisabled}
                  className="h-14 w-full max-w-2xl rounded-2xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-bold text-white shadow-[0_10px_24px_rgba(124,77,229,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {cta}
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 타입/린트 에러 없음, 빌드 성공.

- [ ] **Step 4: 수동 스모크 테스트(키 있을 때)**

`.env.local`에 유효한 `OPENROUTER_API_KEY` 입력 후:
Run: `npm run dev`
브라우저에서 `/explore` → 입력방식 선택 → Q1~6 응답 → `/explore/path` 진입 확인.
체크: Q7-A 6선택지가 Pair Code에 맞게 표시 → 1·2순위 선택 → 로딩 →
Q7-B 10선택지 생성 표시 → … → Q10 이름 카드 3개 → 선택 →
`/explore/interpreting` → 결과에 선택한 이름이 persona로 표시.
키를 비우면 첫 생성 단계에서 에러 + 다시 시도 노출 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/explore/path/page.tsx app/explore/questions/page.tsx
git commit -m "feat(explore): Q7~Q10 생성형 오케스트레이터 + Q1~6 점수 연결"
```

---

## Self-Review 결과

- **스펙 커버리지:** 점수산출(T1)·Q7-A정적(T2)·스토어(T3)·OpenRouter(T4)·프롬프트/실행기(T5)·API(T6)·컴포넌트(T7)·오케스트레이터+라우팅+env+persona매핑(T8) 전부 매핑됨.
- **스펙 정제 1건:** "4개 라우트" → 단일 동적 `[stage]` 라우트(DRY). 동작 동일, T6에 명시.
- **타입 일관성:** `Q7BOption.career_pool`, `Q8Chip.chip_id`, `NameCard.name_id` 등 스토어 정의(T3)와 오케스트레이터(T8) 사용 일치. `runStage`/`isStage`/`GenerateInput`(T5) ↔ 라우트(T6) 일치.
- **플레이스홀더:** Q7-A 데이터(T2)는 소스 전사 — 28개 코드 전사 작업이 실제 콘텐츠 채움(형식·검증 테스트 제공). 그 외 모든 단계 실제 코드 포함.
```
