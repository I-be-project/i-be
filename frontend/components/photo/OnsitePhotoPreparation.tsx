"use client";

import { useEffect } from "react";
import { startOnsitePhoto } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

// 사진 등록 직후부터 설문과 병행한다. 새로고침·재로그인 때도 서버가 중복 생성을 막는다.
export function OnsitePhotoPreparation() {
  const hydrated = useSessionStore((s) => s.hasHydrated);
  const onsite = useSessionStore((s) => s.onsiteMode);
  const token = useSessionStore((s) => s.studentToken);
  const hasPhoto = useSessionStore((s) => s.hasPhoto);
  useEffect(() => {
    if (!hydrated || !onsite || !token || !hasPhoto) return;
    void startOnsitePhoto(token).catch(() => {
      // 사진 등록과 설문 진행은 유지하고, 완료 화면에서 상태 확인·재시도를 제공한다.
    });
  }, [hydrated, onsite, token, hasPhoto]);
  return null;
}
