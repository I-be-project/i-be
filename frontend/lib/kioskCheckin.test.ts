import { afterEach, describe, expect, it, vi } from "vitest";
import { kioskCheckinMessage, kioskCheckinUrl, sendKioskCheckin } from "./kioskCheckin";

describe("키오스크 QR 체크인", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("키오스크 주소는 앞뒤 공백만 지우고 그대로 쓴다", () => {
    expect(kioskCheckinUrl("  https://nabi-simulator.vercel.app/k/3\n")).toBe("https://nabi-simulator.vercel.app/k/3");
    expect(kioskCheckinUrl("https://nabi-simulator.vercel.app/k/test")).toBe("https://nabi-simulator.vercel.app/k/test");
  });
  it.each(["https://festival.example/b/AB12CD", "http://nabi-simulator.vercel.app/k/1", "https://nabi-simulator.vercel.app.evil.com/k/1", "https://nabi-simulator.vercel.app/x/1"])("키오스크 QR이 아닌 값 거절: %s", (v) => {
    expect(kioskCheckinUrl(v)).toBeNull();
  });

  it("student_id만 JSON으로, 인증 없이 POST한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendKioskCheckin("https://nabi-simulator.vercel.app/k/1", "s-1")).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://nabi-simulator.vercel.app/k/1");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ student_id: "s-1" });
  });
  it("4xx는 재시도하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendKioskCheckin("https://nabi-simulator.vercel.app/k/9", "s-1")).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("5xx·네트워크 오류는 1회만 재시도한다", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendKioskCheckin("https://nabi-simulator.vercel.app/k/1", "s-1")).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("응답 코드별 안내", () => {
    expect(kioskCheckinMessage(200)).toContain("접수됐어요");
    expect(kioskCheckinMessage(400)).toContain("직원");
    expect(kioskCheckinMessage(404)).toContain("직원");
    expect(kioskCheckinMessage(503)).toContain("잠시 후");
  });
});
