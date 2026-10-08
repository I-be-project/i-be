import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { scanBoothPath, scanPersonaPath } from "./scanBoothCode";

describe("부스 QR 스캔", () => {
  it("인쇄된 QR을 디코딩하고 내부 인증 경로로 연결한다", () => {
    const qr = QRCode.create("https://festival.example/b/Ab12Cd");
    const scale = 8;
    const width = (qr.modules.size + 8) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const index = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
      }
    }
    const decoded = jsQR(pixels, width, width);
    expect(decoded).not.toBeNull();
    expect(scanBoothPath(decoded!.data)).toBe("/b/AB12CD");
  });
  it.each(["javascript:alert(1)", "https://example.com/login", "/b/../admin", "/b/ABC123/extra", "아무 텍스트", "/b/AB12"])('부스 QR이 아닌 값 거절: %s', (value) => {
    expect(scanBoothPath(value)).toBeNull();
  });
});

describe("페르소나 카드 QR 스캔", () => {
  const legacy = `${"a".repeat(32)}.${"B".repeat(43)}`;
  it.each([
    ["https://i-be.vercel.app/p/AB23CD45", "/p/AB23CD45/home"],
    ["https://i-be.vercel.app/p/AB23CD45/home", "/p/AB23CD45/home"],
    [`https://i-be.vercel.app/p/${legacy}/home`, `/p/${legacy}/home`],
  ])("공개 페이지로 연결: %s", (value, path) => {
    expect(scanPersonaPath(value)).toBe(path);
  });
  it.each(["javascript:alert(1)", "/p/../admin", "/p/AB23CD45/growth/x", "/p/ab23cd45", "/p/AB23CD4", "/b/AB12CD"])("카드 QR이 아닌 값 거절: %s", (value) => {
    expect(scanPersonaPath(value)).toBeNull();
  });
});
