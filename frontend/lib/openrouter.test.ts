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
