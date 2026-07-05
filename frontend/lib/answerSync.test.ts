import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildStagePayloads,
  persistStage,
  reconcileAllAnswers,
} from "@/lib/answerSync";
import { useSessionStore } from "@/store/useSessionStore";

// 각 테스트가 스토어의 진행 상태를 초기화한다(모듈 싱글턴 공유이므로 필수).
function resetStore() {
  useSessionStore.setState({
    sessionId: null,
    answers: [],
    riasecScores: null,
    pairCode: null,
    q7aSelection: null,
    q7bSelection: null,
    q8Selection: null,
    q9Selection: null,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// fetch 목 호출에서 요청 본문(JSON)을 꺼낸다.
function parseBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("answerSync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("persistStage — 재시도", () => {
    it("네트워크 일시 실패(status 0) 후 재시도해 성공하고 sessionId를 저장한다", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("network down"))
        .mockResolvedValueOnce(jsonResponse({ session_id: "S1" }));
      vi.stubGlobal("fetch", fetchMock);

      const sid = await persistStage("tok", "q1to6", { a: 1 });

      expect(sid).toBe("S1");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(useSessionStore.getState().sessionId).toBe("S1");
    });

    it("401은 재시도하지 않고 즉시 실패한다(빠른 실패)", async () => {
      useSessionStore.setState({ sessionId: "S1" }); // 세션 생성 단계는 건너뛴다
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: "unauthorized", message: "no" } }, 401),
        );
      vi.stubGlobal("fetch", fetchMock);

      await expect(persistStage("tok", "q7a", { x: 1 })).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("persistStage — sessionId single-flight", () => {
    it("sessionId 없이 동시 저장해도 세션은 하나만 만든다(세션 분할 방지)", async () => {
      // 매 호출마다 새 Response를 반환한다(Response 본문은 1회만 읽을 수 있음).
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ session_id: "S1" })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const [a, b] = await Promise.all([
        persistStage("tok", "q1to6", { a: 1 }),
        persistStage("tok", "q7a", { b: 2 }),
      ]);

      expect(a).toBe("S1");
      expect(b).toBe("S1");
      expect(useSessionStore.getState().sessionId).toBe("S1");
      // 세션 생성(=본문에 sessionId 없음) 요청은 정확히 1건이어야 한다.
      const creates = fetchMock.mock.calls.filter(
        (c) => parseBody(c).sessionId === undefined,
      );
      expect(creates).toHaveLength(1);
    });
  });

  describe("buildStagePayloads / reconcileAllAnswers", () => {
    it("스토어의 존재하는 모든 단계를 재구성한다", () => {
      useSessionStore.setState({
        answers: [
          { questionId: 1, value: "o1" },
          { questionId: 2, value: "o2" },
        ],
        riasecScores: { R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 },
        pairCode: "RI",
        q9Selection: { chips: [{ chip_id: "c1", text: "우주" }], freeText: "메모" },
      });

      const stages = buildStagePayloads();
      expect(stages.map((s) => s.stage)).toEqual(["q1to6", "q9"]);
      expect(stages[0].answer).toMatchObject({
        optionIds: ["o1", "o2"],
        pairCode: "RI",
      });
      expect(stages[1].answer).toEqual({ chips: ["우주"], freeText: "메모" });
    });

    it("완료 직전 모든 단계를 같은 세션으로 재전송한다(멱등)", async () => {
      useSessionStore.setState({
        sessionId: "S1",
        answers: [{ questionId: 1, value: "o1" }],
        riasecScores: { R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 },
        pairCode: "RI",
        q9Selection: { chips: [{ chip_id: "c1", text: "우주" }], freeText: "" },
      });
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ session_id: "S1" })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const sid = await reconcileAllAnswers("tok");

      expect(sid).toBe("S1");
      expect(fetchMock.mock.calls.map((c) => parseBody(c).stage)).toEqual([
        "q1to6",
        "q9",
      ]);
      for (const c of fetchMock.mock.calls) {
        expect(parseBody(c).sessionId).toBe("S1");
      }
    });

    it("저장할 답변이 없으면 예외를 던진다", async () => {
      await expect(reconcileAllAnswers("tok")).rejects.toThrow();
    });

    it("완료 세션에 재전송하면 409 ApiError를 그대로 전파한다(삼키거나 재시도 안 함)", async () => {
      // finalizeSurvey의 409 성공처리는 reconcile이 409를 status 그대로 던진다는 계약에 의존한다.
      useSessionStore.setState({
        sessionId: "S1",
        riasecScores: { R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 },
        pairCode: "RI",
        q9Selection: { chips: [{ chip_id: "c1", text: "우주" }], freeText: "" },
      });
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            jsonResponse(
              { error: { code: "conflict", message: "이미 종료된 세션입니다." } },
              409,
            ),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      await expect(reconcileAllAnswers("tok")).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
      });
      // 409는 일시적이 아니므로 첫 단계에서 재시도 없이 즉시 실패한다.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
