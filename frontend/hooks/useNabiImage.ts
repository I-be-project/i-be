"use client";

import { useEffect, useState } from "react";
import { getMyNabi, getPublicNabi } from "@/lib/api";
import { useSessionStore } from "@/store/useSessionStore";

// 나비가 그리는 중(processing)이면 20초 간격으로 몇 번만 다시 묻는다 — 보통 1~2분.
const RETRY_MS = 20_000;
const MAX_RETRIES = 6;
// 그리는 중이 아닌 결과(done·pending·실패)는 10분간 다시 묻지 않는다 — 홈 탭에 올 때마다
// 서버가 나비 서버까지 두드리지 않게. 메모리가 기준이고 새로고침 대비로 sessionStorage에도 둔다.
const CACHE_MS = 10 * 60_000;
const STORAGE_KEY = "hm.nabi";

interface Cached { key: string; url: string | null; until: number }
let memory: Cached | null = null;

function read(key: string): Cached | null {
  let hit = memory;
  if (!hit) {
    try { hit = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Cached | null; } catch { hit = null; }
  }
  return hit && hit.key === key && hit.until > Date.now() ? hit : null;
}

function write(entry: Cached) {
  memory = entry;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry)); } catch { /* 저장소를 못 쓰는 환경 — 메모리만 */ }
}

/** 카드 뒷면 나비 그림 주소. 공개 페이지면 shareCode로 조회. 그림이 없거나 실패하면 null. */
export function useNabiImage(enabled: boolean, shareCode: string | null): string | null {
  const token = useSessionStore((s) => s.studentToken);
  const key = shareCode ? `p:${shareCode}` : token ? `me:${token}` : null;
  const [fetched, setFetched] = useState<string | null>(null);
  // 캐시는 렌더에서 바로 읽는다(effect 안 setState 금지 규칙). 요청은 캐시가 없을 때만.
  const hit = enabled && key ? read(key) : null;
  useEffect(() => {
    if (!enabled || !key || read(key)) return;
    let active = true;
    let timer: number | undefined;
    const load = async (attempt: number) => {
      try {
        const result = shareCode ? await getPublicNabi(shareCode) : await getMyNabi(token!);
        if (!active) return;
        if (result.status === "processing") {
          if (attempt < MAX_RETRIES) timer = window.setTimeout(() => void load(attempt + 1), RETRY_MS);
          return;
        }
        const next = result.status === "done" ? result.image_url : null;
        write({ key, url: next, until: Date.now() + CACHE_MS });
        setFetched(next);
      } catch {
        // 나비 그림은 부가 요소 — 실패하면 기본 뒷면을 그대로 둔다.
      }
    };
    void load(0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [enabled, key, shareCode, token]);
  return hit ? hit.url : fetched;
}
