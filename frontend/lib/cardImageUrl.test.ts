import { describe, expect, it } from "vitest";
import { isAllowedCardUrl } from "./cardImageUrl";

describe("카드 이미지 프록시 허용 주소", () => {
  it("S3 서명 카드 주소는 허용한다", () => {
    expect(isAllowedCardUrl("https://s3.ap-northeast-2.amazonaws.com/i-be-bucket/cards/abc/def.png?X-Amz-Signature=1")).toBe(true);
  });
  it.each([
    "http://s3.ap-northeast-2.amazonaws.com/b/cards/a.png",
    "https://evil.com/b/cards/a.png",
    "https://s3.ap-northeast-2.amazonaws.com.evil.com/b/cards/a.png",
    "https://s3.ap-northeast-2.amazonaws.com/b/uploads/photo.png",
    "https://s3.ap-northeast-2.amazonaws.com/b/cards/a.jpg",
    "http://localhost:8000/admin",
    "아무 글자",
  ])("다른 주소는 거절한다: %s", (url) => {
    expect(isAllowedCardUrl(url)).toBe(false);
  });
});
