"use client";

import { createContext, useContext } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { clearOperatorToken, getOperatorToken } from "@/lib/operatorAuth";

export type ConsoleRole = "admin" | "operator";

export interface ConsoleValue {
  role: ConsoleRole;
  getToken: () => string | null;
  clearToken: () => void;
  /** 세션 만료 시 보낼 로그인 경로. */
  loginPath: string;
  /** 내비 링크를 조립할 기준 경로. */
  basePath: string;
}

// 모듈 상수로 둬야 레이아웃이 리렌더돼도 컨텍스트 값이 바뀌지 않는다
// (레이아웃 안에서 객체 리터럴을 만들면 매 렌더마다 새 값이 되어 소비자가 전부 리렌더된다).
export const ADMIN_CONSOLE: ConsoleValue = {
  role: "admin",
  getToken: getAdminToken,
  clearToken: clearAdminToken,
  loginPath: "/admin/login",
  basePath: "/admin",
};

export const OPERATOR_CONSOLE: ConsoleValue = {
  role: "operator",
  getToken: getOperatorToken,
  clearToken: clearOperatorToken,
  loginPath: "/operator/login",
  basePath: "/operator",
};

const ConsoleContext = createContext<ConsoleValue | null>(null);

export function ConsoleProvider({
  value,
  children,
}: {
  value: ConsoleValue;
  children: React.ReactNode;
}) {
  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

/** 콘솔(관리자·운영진) 공유 컴포넌트에서 역할·토큰·경로를 읽는다. */
export function useConsole(): ConsoleValue {
  const value = useContext(ConsoleContext);
  if (value === null) {
    throw new Error("useConsole은 ConsoleProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}
