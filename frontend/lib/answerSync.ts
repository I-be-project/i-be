// 설문 답변의 "유실 없는" 저장을 담당하는 동기화 계층.
//
// 배경(문제 1): 기존에는 저장 실패를 삼키고 그대로 다음 화면으로 넘어가,
// 순간 네트워크 단절 하나로 q1to6(RIASEC)·중간 단계 답변이 백엔드 세션에서
// 영영 사라졌다(재전송 경로 없음). 이 모듈은 세 가지로 그 유실을 막는다.
//
//  1) saveWithRetry — 일시적 실패(네트워크·5xx)를 지수 백오프로 재시도.
//  2) persistStage  — sessionId 확보를 single-flight로 직렬화해, 첫 저장이
//     지연/실패해도 단계마다 새 세션이 만들어지는 "세션 분할"을 막는다.
//  3) reconcileAllAnswers — 완료(complete) 직전에 스토어(=localStorage에
//     영속)의 전체 답변을 세션에 다시 밀어넣는다. insert가 (session_id, stage)
//     기준 멱등(upsert)이라 재전송은 안전하며, 어느 단계 저장이 실패했든
//     완료 세션은 항상 완전해진다. 즉 "완료"가 데이터 무결성의 단일 관문이다.

import { ApiError, saveAnswer } from "@/lib/api";
import type { AnswerStage, SaveAnswerResponse } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 재시도해도 의미 있는 실패인지(일시적)인지 판별.
// - status 0  : 네트워크 단절/CORS/서버 다운 (request()가 ApiError(…, 0)로 던짐)
// - status 5xx: 서버 일시 장애
// 401/403/409/422 같은 4xx는 재시도해도 동일하므로 즉시 전파(빠른 실패).
function isTransient(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

interface SaveInput {
  sessionId?: string;
  stage: AnswerStage;
  answer: Record<string, unknown>;
}

// 일시적 실패를 지수 백오프로 재시도(총 tries회). 마지막 실패는 그대로 던진다.
async function saveWithRetry(
  token: string,
  input: SaveInput,
  tries = 3,
  baseDelayMs = 400,
): Promise<SaveAnswerResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await saveAnswer(token, input);
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === tries - 1) throw error;
      await sleep(baseDelayMs * 2 ** attempt); // 0.4s → 0.8s → 1.6s
    }
  }
  throw lastError; // 도달 불가(위 루프가 항상 return/throw)
}

// sessionId 확보를 single-flight로 직렬화한다.
// 여러 저장이 sessionId 없이 동시에 나가도 세션은 딱 하나만 만들어지고,
// 나머지는 그 sessionId를 기다렸다가 각자 단계를 저장한다.
// 모듈 스코프라 questions/path 두 화면이 같은 락을 공유한다.
let sessionInit: Promise<string> | null = null;

interface EnsureResult {
  sessionId: string;
  // 세션을 새로 만든 호출이면, 그 seed 단계는 이미 저장된 상태다.
  seededStage: AnswerStage | null;
}

async function ensureSession(token: string, seed: SaveInput): Promise<EnsureResult> {
  const existing = useSessionStore.getState().sessionId;
  if (existing) return { sessionId: existing, seededStage: null };

  const initiator = sessionInit === null;
  if (initiator) {
    sessionInit = (async () => {
      // sessionId 없이 저장하면 백엔드가 in_progress 세션을 만들어 id를 돌려준다.
      const res = await saveWithRetry(token, {
        stage: seed.stage,
        answer: seed.answer,
      });
      useSessionStore.getState().setSessionId(res.session_id);
      return res.session_id;
    })();
  }
  const pending = sessionInit!;
  try {
    const sessionId = await pending;
    return { sessionId, seededStage: initiator ? seed.stage : null };
  } finally {
    // 버스트가 끝나면 락을 비워, 이후(예: 재로그인으로 sessionId 초기화) 호출이
    // 낡은 세션 id를 재사용하지 않도록 한다. 실패한 경우에도 반드시 비운다.
    if (initiator && sessionInit === pending) sessionInit = null;
  }
}

// 한 단계 답변을 저장한다(sessionId 확보 포함). 성공 시 sessionId 반환.
// 세션을 새로 만든 호출은 seed 단계가 함께 저장되므로 추가 저장을 생략한다.
export async function persistStage(
  token: string,
  stage: AnswerStage,
  answer: Record<string, unknown>,
): Promise<string> {
  const { sessionId, seededStage } = await ensureSession(token, { stage, answer });
  if (seededStage === stage) return sessionId;
  await saveWithRetry(token, { sessionId, stage, answer });
  return sessionId;
}

export interface StagePayload {
  stage: AnswerStage;
  answer: Record<string, unknown>;
}

// 스토어의 현재 진행 상태를 저장 시점과 동일한 단계별 payload로 재구성한다.
// (각 화면의 저장 코드와 payload 형태를 일치시켜, 재전송이 원래 저장을 대체 가능하게)
export function buildStagePayloads(): StagePayload[] {
  const s = useSessionStore.getState();
  const stages: StagePayload[] = [];

  const optionIds = s.answers
    .map((a) => a.value)
    .filter((v): v is string => typeof v === "string");

  if (s.riasecScores && s.pairCode) {
    stages.push({
      stage: "q1to6",
      answer: {
        answers: s.answers,
        optionIds,
        riasec: s.riasecScores,
        pairCode: s.pairCode,
      },
    });
  }
  if (s.q7aSelection) {
    stages.push({
      stage: "q7a",
      answer: {
        first: s.q7aSelection.first.label,
        second: s.q7aSelection.second.label,
      },
    });
  }
  if (s.q7bSelection) {
    stages.push({
      stage: "q7b",
      answer: {
        first: {
          subfield_id: s.q7bSelection.first.subfield_id,
          title: s.q7bSelection.first.student_title,
        },
        second: {
          subfield_id: s.q7bSelection.second.subfield_id,
          title: s.q7bSelection.second.student_title,
        },
      },
    });
  }
  if (s.q8Selection) {
    stages.push({
      stage: "q8",
      answer: {
        chips: s.q8Selection.chips.map((c) => c.text),
        freeText: s.q8Selection.freeText,
      },
    });
  }
  if (s.q9Selection) {
    stages.push({
      stage: "q9",
      answer: {
        chips: s.q9Selection.chips.map((c) => c.text),
        freeText: s.q9Selection.freeText,
      },
    });
  }
  return stages;
}

// 완료 직전 호출: 스토어의 모든 단계를 세션에 재전송한다(멱등이라 중복 안전).
// 반환된 sessionId로 곧바로 completeSurvey를 호출하면, 완료 세션은 앞선 저장이
// 일부 실패했더라도 항상 q1to6~q9를 온전히 갖는다. 저장할 답변이 없으면 예외.
export async function reconcileAllAnswers(token: string): Promise<string> {
  const stages = buildStagePayloads();
  if (stages.length === 0) {
    throw new Error("동기화할 답변이 없습니다.");
  }
  // 첫 단계로 세션 확보(이미 있으면 재사용), 나머지는 그 세션에 순차 저장.
  const sessionId = await persistStage(token, stages[0].stage, stages[0].answer);
  for (let i = 1; i < stages.length; i++) {
    await saveWithRetry(token, {
      sessionId,
      stage: stages[i].stage,
      answer: stages[i].answer,
    });
  }
  return sessionId;
}
