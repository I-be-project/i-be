import { describe, it, expect } from "vitest";
import { boothQrFilename } from "@/lib/boothQr";

describe("boothQrFilename", () => {
  it("코드만으로 파일명을 만든다", () => {
    expect(boothQrFilename("K7M2QX")).toBe("booth-K7M2QX.png");
  });
});
