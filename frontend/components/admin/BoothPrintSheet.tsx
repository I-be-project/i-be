"use client";

import { useEffect, useState } from "react";
import { renderBoothQrPng } from "@/lib/boothQr";
import { ZONE_LABELS } from "@/lib/competencies";
import type { AdminBooth } from "@/lib/api";

/**
 * 인쇄용 QR 격자. 부스 한 칸에 QR·이름·기관·코드를 함께 찍는다.
 *
 * QR PNG는 canvas로 그리므로 브라우저에서만 만들어진다. booths가 바뀔 때마다(존 필터를
 * 바꿔 부모가 새 배열을 넘길 때 포함) 다시 그린다 — 최대 70장 규모라 기능상 문제는 아니다.
 */
export function BoothPrintSheet({
  booths,
  onRenderFailedChange,
}: {
  booths: AdminBooth[];
  /** QR 렌더 성공/실패를 부모에 알린다. 실패 시 부모가 인쇄 버튼을 막을 수 있게. */
  onRenderFailedChange?: (failed: boolean) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      booths.map(async (b) => [b.id, await renderBoothQrPng(b.qr_url, b.code)] as const)
    )
      .then((pairs) => {
        if (!active) return;
        setImages(Object.fromEntries(pairs));
        onRenderFailedChange?.(false);
      })
      .catch(() => {
        // ctx가 null이거나 image.onerror·QRCode.toDataURL 실패로 하나라도 reject되면
        // Promise.all이 통째로 reject돼 나머지도 로딩(회색 상자) 상태로 남는다.
        // 여기서 삼키지 않고 부모에 알려야 그 상태로 인쇄하는 걸 막을 수 있다.
        if (active) onRenderFailedChange?.(true);
      });
    return () => {
      active = false;
    };
  }, [booths, onRenderFailedChange]);

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
