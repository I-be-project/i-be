import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeSurvey } from "@/lib/api";

describe("completeSurvey", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs persona to /api/sessions/complete with bearer token", async () => {
    const payload = {
      has_completed: true,
      retry_enabled: false,
      student: null,
      persona: null,
      card: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const persona = { name: "A", tagline: "b", keywords: ["k"], fields: ["f"] };
    const res = await completeSurvey("tok123", persona);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/sessions/complete");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body as string)).toEqual(persona);
    expect(res.has_completed).toBe(true);
  });
});
