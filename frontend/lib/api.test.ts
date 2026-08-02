import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bulkDeleteAdminStudents,
  checkInBooth,
  completeSurvey,
  createAdminBooth,
  deleteAdminBooth,
  deleteAdminStudent,
  fetchAdminBooths,
  fetchAdminClassProgress,
  fetchAdminStudentDetail,
  fetchAdminStudentPhotoUrl,
  fetchAdminStudents,
  fetchBoothByCode,
  generateStage,
  saveAnswer,
  updateAdminBooth,
  updateMyProfile,
} from "@/lib/api";

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

describe("updateMyProfile", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("PATCHes /api/students/me with bearer token and returns the updated profile", async () => {
    const payload = {
      has_completed: false,
      retry_enabled: false,
      student: {
        school: "한마당고",
        grade: 2,
        class_no: 3,
        student_no: 11,
        name: "새이름",
        gender: "female",
        photo_url: null,
      },
      persona: null,
      card: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await updateMyProfile("tok123", { name: "새이름", gender: "female" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/students/me");
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body as string)).toEqual({ name: "새이름", gender: "female" });
    expect(res.student?.name).toBe("새이름");
  });
});

describe("fetchAdminStudentDetail", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/admin/students/:id with bearer token", async () => {
    const detail = { id: "s1", name: "홍길동", sessions: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAdminStudentDetail("tok", "s1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/students/s1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(res.name).toBe("홍길동");
  });
});

describe("deleteAdminStudent", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("DELETEs /api/admin/students/:id with bearer token", async () => {
    const body = { student_id: "s1", removed_storage_objects: 2 };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await deleteAdminStudent("tok", "s1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/students/s1");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(res.removed_storage_objects).toBe(2);
  });
});

describe("bulkDeleteAdminStudents", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs ids to /api/admin/students/bulk-delete with bearer token", async () => {
    const body = { deleted: ["a", "b"], not_found: [], removed_storage_objects: 3 };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await bulkDeleteAdminStudents("tok", ["a", "b"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/students/bulk-delete");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["a", "b"] });
    expect(res.deleted).toEqual(["a", "b"]);
  });
});

describe("request 타임아웃", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // 응답을 절대 주지 않고, abort 신호가 오면 그때 reject(실제 fetch의 abort 동작 흉내).
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
  }

  it("응답이 매달리면(hang) 기본 20초 후 ApiError(status 0, '오래')로 전환한다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());

    const p = saveAnswer("tok", { stage: "q1to6", answer: {} });
    // 거부 핸들러를 먼저 붙여 unhandled rejection을 피한 뒤 타이머를 진행시킨다.
    const assertion = expect(p).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: expect.stringContaining("오래"),
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("generateStage는 60초 상한을 쓴다 — 20초엔 살아 있고 60초에 끊긴다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());

    const p = generateStage("tok", "q8", {});
    let settled = false;
    p.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(false); // 기본 20초로 끊기면 안 된다(LLM은 더 걸릴 수 있음)

    const assertion = expect(p).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
    });
    await vi.advanceTimersByTimeAsync(40_000); // 누적 60초 → abort
    await assertion;
  });

  it("타임아웃이 아닌 네트워크 실패는 '연결' 메시지로 구분한다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveAnswer("tok", { stage: "q1to6", answer: {} }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: expect.stringContaining("연결"),
    });
  });
});

describe("fetchAdminClassProgress", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/admin/progress/classes with school query", async () => {
    const rows = [
      { grade: 1, class_no: 1, total: 3, completed: 1, in_progress: 1, not_started: 1 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAdminClassProgress("tok123", "한마당고");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8000/api/admin/progress/classes?school=${encodeURIComponent("한마당고")}`,
    );
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res[0].completed).toBe(1);
  });
});

describe("fetchAdminStudentPhotoUrl", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs the photo-url endpoint and unwraps photo_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ photo_url: "https://signed/x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const url = await fetchAdminStudentPhotoUrl("tok123", "s1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/admin/students/s1/photo-url",
    );
    expect(url).toBe("https://signed/x");
  });
});

describe("fetchAdminStudents include_photo", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("passes include_photo=false through to the query string", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminStudents("tok123", { school: "한마당고", include_photo: false });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("include_photo=false");
  });

  it("omits include_photo when not given", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0, items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminStudents("tok123", { school: "한마당고" });

    expect(fetchMock.mock.calls[0][0] as string).not.toContain("include_photo");
  });
});

describe("부스 관리 API", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  const booth = {
    id: "b1",
    code: "K7M2QX",
    name: "드론 체험",
    description: null,
    qr_url: "https://i-be.vercel.app/b/K7M2QX",
    created_at: "2026-08-02T09:00:00Z",
  };

  it("GETs /api/admin/booths with bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([booth]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAdminBooths("tok123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res[0].qr_url).toBe("https://i-be.vercel.app/b/K7M2QX");
  });

  it("POSTs name and description to /api/admin/booths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booth), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdminBooth("tok123", { name: "드론 체험", description: null });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "드론 체험",
      description: null,
    });
  });

  it("PATCHes /api/admin/booths/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booth), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateAdminBooth("tok123", "b1", { name: "새 이름" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths/b1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "새 이름" });
  });

  it("DELETEs /api/admin/booths/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ booth_id: "b1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await deleteAdminBooth("tok123", "b1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/admin/booths/b1");
    expect(init.method).toBe("DELETE");
    expect(res.booth_id).toBe("b1");
  });
});

describe("부스 방문 API (학생)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/booths/:code with bearer token", async () => {
    const body = {
      code: "K7M2QX",
      name: "드론 체험",
      description: null,
      visited: false,
      visited_at: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchBoothByCode("tok123", "K7M2QX");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/booths/K7M2QX");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res.visited).toBe(false);
  });

  it("POSTs /api/booths/:code/visit and reports a fresh record", async () => {
    const body = {
      code: "K7M2QX",
      name: "드론 체험",
      visited_at: "2026-08-02T09:00:00Z",
      already_visited: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await checkInBooth("tok123", "K7M2QX");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/booths/K7M2QX/visit");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(res.already_visited).toBe(false);
  });

  it("카드 발급 전 403은 ApiError(status 403)으로 전달된다", async () => {
    const body = {
      error: { code: "forbidden", message: "탐험을 끝내고 카드를 받은 뒤에 부스를 인증할 수 있어요." },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBoothByCode("tok123", "K7M2QX")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: expect.stringContaining("카드"),
    });
  });

  it("코드에 URL 예약문자가 섞여도 이스케이프해서 보낸다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBoothByCode("tok123", "a/b")).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/booths/a%2Fb");
  });
});
