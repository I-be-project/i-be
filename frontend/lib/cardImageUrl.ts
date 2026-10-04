// 카드 이미지 프록시(app/card-image)가 받아 줄 주소인지. 아무 주소나 대신 받아 주면 열린 프록시가 되므로
// 백엔드가 서명하는 S3 경로 스타일 주소(리전 엔드포인트/<버킷>/cards/...)만 허용한다.
const CARD_HOST = "s3.ap-northeast-2.amazonaws.com";

export function isAllowedCardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === CARD_HOST && /^\/[^/]+\/cards\/[^?#]+\.png$/.test(url.pathname);
  } catch {
    return false;
  }
}
