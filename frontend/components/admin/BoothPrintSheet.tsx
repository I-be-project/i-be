"use client";

import { useEffect, useState } from "react";
import { renderBoothQrPng } from "@/lib/boothQr";
import { ZONE_LABELS } from "@/lib/competencies";
import type { AdminBooth } from "@/lib/api";

/**
 * 인쇄용 QR 격자. 부스 한 칸에 QR·이름·기관·코드를 함께 찍는다.
 *
 * QR PNG는 canvas로 그리므로 브라우저에서만 만들어진다. 부스 수만큼(최대 70장) 한 번
 * 그려서 상태에 담아 두고, 다시 그리지 않는다.
 */
export function BoothPrintSheet({ booths }: { booths: AdminBooth[] }) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      booths.map(async (b) => [b.id, await renderBoothQrPng(b.qr_url, b.code)] as const)
    ).then((pairs) => {
      if (active) setImages(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, [booths]);

  return (
    <div className="grid grid-cols-2 gap-4 print:grid-cols-2">
      {booths.map((booth) => (
        <div
          key={booth.id}
          className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border border-solid border-slate-300 p-4"
        >
          {images[booth.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- canvas가 만든 data URL이라 next/image가 처리할 수 없다
            <img src={images[booth.id]} alt="" className="w-40" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded bg-slate-100" />
          )}
          <p className="text-center text-base font-bold">{booth.name}</p>
          <p className="text-center text-xs text-slate-500">{booth.description ?? ""}</p>
          <p className="text-xs text-slate-400">
            {ZONE_LABELS[booth.zone]} · {booth.code}
          </p>
        </div>
      ))}
    </div>
  );
}
