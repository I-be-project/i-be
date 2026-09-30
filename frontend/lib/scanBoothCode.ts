/** 인쇄된 /b/<6자리 코드> 링크만 내부 인증 경로로 변환한다. 외부 URL로 이동하지 않는다. */
export function scanBoothPath(value: string): string | null {
  try {
    const url = new URL(value, "https://booth.local");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = /^\/b\/([a-z0-9]{6})\/?$/i.exec(url.pathname);
    return match ? `/b/${match[1].toUpperCase()}` : null;
  } catch { return null; }
}
