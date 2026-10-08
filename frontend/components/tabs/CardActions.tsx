"use client";

import { useState } from "react";
import { Download, Link } from "lucide-react";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

// iOS는 <a download>로 사진 앱에 저장할 수 없어 공유 시트('이미지 저장')를 써야 한다.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * 카드 이미지를 기기에 저장. S3 서명 URL은 CORS 때문에 직접 받을 수 없어 같은 출처 프록시(/card-image)로 받는다.
 * iOS는 공유 시트(여기서 '이미지 저장' → 사진 앱), 그 밖에는 파일로 바로 내려받는다.
 */
async function saveCard(url: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(`/card-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (isIOS() && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return null;
    }
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return "카드 이미지를 저장했어.";
  } catch (e) {
    if (isAbort(e)) return null;
    return "저장하지 못했어. 잠시 후 다시 눌러 줘.";
  }
}

/** 공개 페이지 링크를 클립보드에 복사한다. */
async function copyLink(url: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(url);
    return "링크를 복사했어. 친구에게 붙여넣어 보내 봐.";
  } catch {
    return `이 링크를 복사해 줘: ${url}`;
  }
}

// 홈 카드 아래 버튼 두 개 — 이미지 저장 / 링크 복사.
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
      {sharePath && <button type="button" disabled={busy} onClick={() => run(() => copyLink(new URL(sharePath, window.location.origin).href))} className={`${button} bg-white text-hm-blue shadow-[0_8px_20px_-10px_rgba(0,91,171,0.32),0_1px_3px_rgba(0,91,171,0.08)]`}><Link size={17} />링크 복사</button>}
    </div>
    {message && <p role="status" className="mt-2 break-all text-center text-xs text-hm-blue/70">{message}</p>}
  </div>;
}
