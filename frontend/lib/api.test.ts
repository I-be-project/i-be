import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bulkDeleteAdminStudents,
  completeSurvey,
  deleteAdminStudent,
  fetchAdminStudentDetail,
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
