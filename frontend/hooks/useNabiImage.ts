"use client";

import { useEffect, useState } from "react";
import { getMyNabi, getPublicNabi } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

// 나비가 그리는 중(processing)이면 20초 간격으로 몇 번만 다시 묻는다 — 보통 1~2분.
const RETRY_MS = 20_000;
const MAX_RETRIES = 6;

/** 카드 뒷면 나비 그림 주소. 공개 페이지면 shareCode로 조회. 그림이 없거나 실패하면 null. */
export function useNabiImage(enabled: boolean, shareCode: string | null): string | null {
  const token = useSessionStore((s) => s.studentToken);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || (!shareCode && !token)) return;
    let active = true;
    let timer: number | undefined;
    const load = async (attempt: number) => {
      try {
        const result = shareCode ? await getPublicNabi(shareCode) : await getMyNabi(token!);
        if (!active) return;
        if (result.status === "done") setUrl(result.image_url);
        else if (result.status === "processing" && attempt < MAX_RETRIES) timer = window.setTimeout(() => void load(attempt + 1), RETRY_MS);
      } catch {
        // 나비 그림은 부가 요소 — 실패하면 기본 뒷면을 그대로 둔다.
      }
    };
    void load(0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [enabled, shareCode, token]);
  return url;
}
