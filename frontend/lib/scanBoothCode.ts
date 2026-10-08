/** 인쇄된 /b/<6자리 코드> 링크만 내부 인증 경로로 변환한다. 외부 URL로 이동하지 않는다. */
export function scanBoothPath(value: string): string | null {
  try {
    const url = new URL(value, "https://booth.local");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = /^\/b\/([a-z0-9]{6})\/?$/i.exec(url.pathname);
    return match ? `/b/${match[1].toUpperCase()}` : null;
  } catch { return null; }
}

/**
 * 페르소나 카드 QR(/p/<코드>)을 공개 페이지 경로로 변환한다.
 * 카드의 짧은 코드(8자)와 예전 서명 코드(UUID hex + "." + 서명) 둘 다 받는다 — 백엔드 get_public_profile과 같은 두 형식.
 */
export function scanPersonaPath(value: string): string | null {
  try {
    const url = new URL(value, "https://booth.local");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = /^\/p\/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}|[0-9a-f]{32}\.[A-Za-z0-9_-]{43})(?:\/home)?\/?$/.exec(url.pathname);
    return match ? `/p/${match[1]}/home` : null;
  } catch { return null; }
}
