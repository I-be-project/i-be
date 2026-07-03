"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/store/useSessionStore";

// persist(skipHydration: true)로 자동 복원을 껐기 때문에, 앱 최초 마운트 시 여기서
// 한 번 명시적으로 localStorage → 스토어 복원을 트리거한다.
// 첫 클라이언트 렌더는 서버와 동일한 초기 상태(비로그인)로 그려져 hydration 불일치가 없고,
// 이 effect가 실행되며 복원 → hasHydrated=true로 바뀌어 가드가 인증을 판단한다.
export function SessionHydrator() {
  useEffect(() => {
    void useSessionStore.persist.rehydrate();
  }, []);

  return null;
}
