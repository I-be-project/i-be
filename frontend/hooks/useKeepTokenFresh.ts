"use client";

import { useEffect } from "react";
import { refreshStudentToken } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

// 학생 토큰(6h 만료)을 활성 사용 중 조용히 갱신해 "설문 도중 만료"를 예방한다.
// 트리거: 마운트 · 탭 복귀(focus·visibilitychange) · 30분 주기.
// 이미 만료(401)면 갱신이 실패하는데, 그 경우는 조용히 무시한다 — 실제 저장 시점의
// 401 처리(진행상황 보존한 재로그인 유도)가 복구를 담당하므로 여기서 관여하지 않는다.
export function useKeepTokenFresh(): void {
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const { studentToken } = useSessionStore.getState();
      if (!studentToken) return;
      try {
        const res = await refreshStudentToken(studentToken);
        // 갱신 사이 다른 학생으로 로그인했을 수 있으니, 현재 스토어 값과 일치할 때만 반영한다.
        if (cancelled) return;
        if (useSessionStore.getState().studentToken !== studentToken) return;
        useSessionStore.getState().setAuth(res.student_token, res.student_id);
      } catch {
        // 만료(401)·네트워크 오류 모두 무시. 저장 시점의 401 처리가 재로그인으로 복구한다.
      }
    };

    void refresh();
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void refresh(), 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
}
