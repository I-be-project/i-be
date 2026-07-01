# Q7~Q10 생성형 진로 페르소나 플로우 설계

작성일: 2026-06-30

## 목적

기존 Q1~Q6 선택형 설문(RIASEC 기반) 뒤에, 나비섬 탐험 콘셉트를 이어가는
Q7~Q10 단계를 추가한다. Q7-A는 Pair Code별 정적 선택지, Q7-B/Q8/Q9/Q10은
OpenRouter LLM으로 개인화 생성한다. 최종 Q10에서 학생이 진로 페르소나 이름을
직접 선택한다.

## 전체 플로우

```
Q1–6 (선택형, 구현됨)
  → [scoring] RIASEC 점수 합산 + Pair Code 산출 (클라이언트)
  → Q7-A  Pair Code별 정적 6선택지, 1·2순위 선택
  → Q7-B  LLM 생성 10선택지, 1·2순위 선택
  → Q8    LLM 생성 표현칩(word_chips), 1~2개 선택 또는 직접입력
  → Q9    LLM 생성 주제칩(topic_chips), 1~2개 선택 또는 직접입력
  → Q10   LLM 생성 페르소나 이름 카드 3장 중 1개 선택
  → /explore/interpreting → /explore/result → /explore/card
```

## 점수 산출 (lib/scoring.ts)

순수 함수, 클라이언트에서 실행. 입력은 Q1~Q6에서 선택한 옵션 ID 배열.

- `computeScores(selectedOptionIds: string[]): Record<RiasecType, number>`
  - 각 옵션의 `primary`에 +2, `secondary`가 있으면 +1 (소스 채점 규칙).
  - 옵션 ID로 `mockQuestions`에서 역조회.
- `derivePairCode(scores): string`
  - 최고 점수 유형 + 차순위 유형을 2글자로 결합 (예: A 7, R 5 → "AR").
  - 동점 시 RIASEC 표준 순서(R,I,A,S,E,C)로 결정적 정렬.
- 결과는 LLM 프롬프트 입력값으로만 사용. 학생 화면에는 점수/유형명 비노출.

## Q7-A 정적 데이터 (lib/mock/q7a.ts)

소스 "Q7-A Pair Code별 학생용 선택지 워딩 수정본"을 전사한다.

- 30개 Pair Code(RI, RA, RS, RE, RC, IR, IA, … CE) × 6 선택지.
- 타입: `Record<string, { id: string; label: string }[]>` (키 = Pair Code).
- 옵션 ID 형식: `q7a-<paircode>-<n>` (예: `q7a-ai-3`).
- 학생용 문구만 포함. 백엔드 분야/직업풀은 Q7-B 호출에서 LLM이 추론한다.

## OpenRouter 연동 (서버)

API 키는 서버 전용. `NEXT_PUBLIC_` 접두사 금지.

### lib/openrouter.ts
- `chatJSON(messages): Promise<unknown>`
  - `OPENROUTER_API_KEY` 없으면 `OpenRouterError("MISSING_KEY")` throw.
  - `OPENROUTER_MODEL` 환경변수, 기본값 `openai/gpt-5.4-mini`.
  - `https://openrouter.ai/api/v1/chat/completions` 호출, `response_format: { type: "json_object" }`.
  - 비2xx 또는 JSON 파싱 실패 시 `OpenRouterError("GENERATION_FAILED")` throw.
- `class OpenRouterError extends Error { code: "MISSING_KEY" | "GENERATION_FAILED" }`

### lib/prompts/{q7b,q8,q9,q10}.ts
각 소스 프롬프트 파일을 시스템/유저 메시지로 변환하는 빌더. 선행 단계 선택값을
주입하고, 출력은 소스에 명시된 JSON 스키마를 그대로 따른다.
- `buildQ7BMessages(input)` — Pair Code, RIASEC 점수, Q7-A 1·2순위(학생 문구).
  LLM이 backend_field/subfields/career_pool까지 함께 생성.
- `buildQ8Messages(input)` — 위 + Q7-B 1·2순위.
- `buildQ9Messages(input)` — 위 + Q8 선택/직접입력.
- `buildQ10Messages(input)` — 위 전체 + Q9 선택/직접입력 + career_pool.

### app/api/generate/{q7b,q8,q9,q10}/route.ts
- `POST` 핸들러. 요청 본문 = 선행 단계 선택 payload.
- 해당 prompt 빌더 → `chatJSON` 호출 → 응답 JSON의 최상위 키(`q7b`/`q8`/`q9`/`q10`)
  존재 여부만 가볍게 검증 후 그대로 반환.
- `OpenRouterError.code`에 따라 400(MISSING_KEY)/502(GENERATION_FAILED) 반환,
  본문에 `{ error, code }`. 그 외 500.

## 상태 관리 (store/useSessionStore.ts 확장)

LLM 호출은 직전 단계 선택을 입력으로 받으므로 각 단계 선택을 보관한다.

추가 필드:
- `riasecScores: Record<RiasecType, number> | null`
- `pairCode: string | null`
- `q7aSelection: { first: Q7AOption; second: Q7AOption } | null`
- `q7bSelection: { first: Q7BOption; second: Q7BOption } | null`
- `q8Selection: { chips: Q8Chip[]; freeText: string } | null`
- `q9Selection: { chips: Q9Chip[]; freeText: string } | null`
- `q10Selection: NameCard | null`

추가 세터: 각 필드별 `setX`. `reset`에 신규 필드 초기화 포함.
(`Answer.value`는 이미 `string | string[]` 지원 — Q1~6 그대로.)

## 클라이언트 오케스트레이터 (app/explore/path/page.tsx)

단일 `"use client"` 페이지가 stage state machine을 구동한다.

- stage: `"q7a" | "q7b" | "q8" | "q9" | "q10"`, 그리고 각 생성 단계 진입 시
  `generating`/`error` 보조 상태.
- 단계 전환 흐름:
  1. Q7-A: 스토어 `pairCode`로 `mockQuestions`/`q7a` 데이터 조회 → `RankSelect`.
     1·2순위 확정 → 스토어 저장 → Q7-B 생성 호출 시작.
  2. 생성 호출(`/api/generate/*`) 중 `GeneratingScreen` 표시. 성공 시 다음 선택
     UI 렌더, 실패 시 에러 + 다시 시도.
  3. Q10 선택 완료 → 선택 이름을 persona로 매핑(스토어 `setPersona`) →
     `/explore/interpreting`로 이동.
- 진행률 표시는 Q1~6과 동일 톤(Progress 바, 7~10/10 카운트)으로 이어붙인다.

### 컴포넌트 (components/explore/)
- `RankSelect` — 옵션 목록에서 1순위·2순위 선택(중복 불가). Q7-A·Q7-B 공용.
- `ChipSelect` — 칩 1~2개 토글 + 자유 입력 textarea. Q8·Q9 공용.
- `NameCardSelect` — 이름 카드 3장 라디오 선택. Q10 전용.
- `GeneratingScreen` — 로딩 애니메이션 + 에러 메시지/다시 시도 버튼.

각 컴포넌트는 표시·선택만 담당(프레젠테이셔널). 호출/상태 전환은 오케스트레이터.

## 에러 처리

- 목업 폴백 없음. 라우트가 비2xx면 `GeneratingScreen`이 한국어 에러 + 다시 시도.
- MISSING_KEY: "AI 연결 설정이 필요해요" 류 안내. GENERATION_FAILED: "다시
  시도해주세요" 류. 다시 시도는 동일 입력으로 재호출.

## 라우팅 변경

- `app/explore/questions/page.tsx`: 마지막 질문 후 `/explore/interpreting` →
  `/explore/path`로 변경.
- `app/explore/path`: Q10 완료 후 `/explore/interpreting`로 이동(기존 결과/카드
  플로우 재사용).

## 환경변수

`.env.local.example` / `.env.local`에 추가:
```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.4-mini
```

## 비범위 (YAGNI)

- 영속성(localStorage). 새로고침 시 스토어 초기화는 기존과 동일.
- 백엔드 결과 저장/전송. 현재는 mock UX 검증 단계.
- 생성 응답 캐싱/스트리밍.
- Q7-A 백엔드 분야의 정적 매핑 테이블(대신 LLM 추론).

## 단위 경계 요약

| 단위 | 역할 | 의존 |
|---|---|---|
| `lib/scoring.ts` | 점수·Pair Code 산출 | `mockQuestions` |
| `lib/mock/q7a.ts` | Q7-A 정적 선택지 | 없음 |
| `lib/openrouter.ts` | OpenRouter 호출/에러 | env |
| `lib/prompts/*` | 프롬프트 빌드 | 선행 선택 타입 |
| `app/api/generate/*` | 단계별 생성 엔드포인트 | prompts, openrouter |
| `store/useSessionStore` | 단계 선택 보관 | 타입 |
| `components/explore/*` | 표시·선택 UI | 없음(프레젠테이셔널) |
| `app/explore/path` | stage 오케스트레이션 | 위 전체 |
