// 운영진 토큰 localStorage 헬퍼. admin_token과 키를 분리해 한쪽 로그아웃이
// 다른 쪽 세션을 끊지 않게 한다.
const OPERATOR_TOKEN_KEY = "operator_token";

export function getOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(OPERATOR_TOKEN_KEY);
}

export function setOperatorToken(token: string): void {
  window.localStorage.setItem(OPERATOR_TOKEN_KEY, token);
}

export function clearOperatorToken(): void {
  window.localStorage.removeItem(OPERATOR_TOKEN_KEY);
}
