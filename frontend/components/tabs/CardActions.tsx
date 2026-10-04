"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/**
 * 카드 이미지 저장. 이미지는 S3 서명 URL(다른 도메인)이라 <a download>가 먹지 않는다.
 * 받아서 휴대폰이면 공유 시트(여기서 '이미지 저장'), 아니면 파일로 내려받는다.
 * 받아오지 못하면(CORS 등) 새 창으로 열어 길게 눌러 저장하게 한다.
 */
async function saveCard(url: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return null;
    }
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return "카드 이미지를 저장했어.";
  } catch (e) {
    if (isAbort(e)) return null;
    window.open(url, "_blank", "noopener");
    return "새 창의 이미지를 길게 눌러 저장해 줘.";
  }
}

/** 공개 페이지 링크 공유. 공유 시트가 없으면 클립보드에 복사한다. */
async function shareLink(url: string, title: string): Promise<string | null> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return null;
    } catch (e) {
      if (isAbort(e)) return null;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "링크를 복사했어. 친구에게 붙여넣어 보내 봐.";
  } catch {
    return `이 링크를 복사해 줘: ${url}`;
  }
}

// 홈 카드 아래 버튼 두 개 — 이미지 저장 / 링크 공유.
export function CardActions({ imageUrl, sharePath, name }: { imageUrl?: string | null; sharePath?: string | null; name?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!imageUrl && !sharePath) return null;
  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(await task());
    setBusy(false);
  };
  const button = "flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold disabled:opacity-60";
  return <div>
    <div className="flex gap-2">
      {imageUrl && <button type="button" disabled={busy} onClick={() => run(() => saveCard(imageUrl, `나Be한마당-${name ?? "페르소나"}-카드.png`))} className={`${button} bg-hm-blue text-white shadow-[0_8px_20px_-10px_rgba(0,91,171,0.32),0_1px_3px_rgba(0,91,171,0.08)]`}><Download size={17} />이미지 저장</button>}
      {sharePath && <button type="button" disabled={busy} onClick={() => run(() => shareLink(new URL(sharePath, window.location.origin).href, `${name ?? "나"}의 나Be한마당 페르소나`))} className={`${button} bg-white text-hm-blue shadow-[0_8px_20px_-10px_rgba(0,91,171,0.32),0_1px_3px_rgba(0,91,171,0.08)]`}><Share2 size={17} />링크 공유</button>}
    </div>
    {message && <p role="status" className="mt-2 break-all text-center text-xs text-hm-blue/70">{message}</p>}
  </div>;
}
