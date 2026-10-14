"use client";

import { Jua } from "next/font/google";
import { useEffect, useState } from "react";
import { renderQrDataUrl } from "@/lib/boothQr";
import type { AdminBooth } from "@/lib/api";

// 부스 앞에 붙이는 안내판이라 본문 글꼴(Pretendard)보다 둥글고 굵은 글꼴을 쓴다.
const signFont = Jua({ weight: "400", subsets: ["latin"] });

/**
 * 인쇄용 QR 안내판. 부스 한 곳이 한 페이지 — QR 크게, 그 아래 부스 이름과 기관.
 *
 * QR PNG는 브라우저에서만 만들어진다. booths가 바뀔 때마다 다시 그린다 — 최대 70장 규모라
 * 기능상 문제는 아니다. 이름은 PNG에 넣지 않고 HTML로 찍는다 — 글꼴을 CSS로 바꿀 수 있고
 * 인쇄 시 벡터라 또렷하다.
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
      booths.map(async (b) => [b.id, await renderQrDataUrl(b.qr_url)] as const),
    )
      .then((pairs) => {
        if (!active) return;
        setImages(Object.fromEntries(pairs));
        onRenderFailedChange?.(false);
      })
      .catch(() => {
        // 하나라도 reject되면 Promise.all이 통째로 reject돼 나머지도 로딩(회색 상자) 상태로
        // 남는다. 여기서 삼키지 않고 부모에 알려야 그 상태로 인쇄하는 걸 막을 수 있다.
        if (active) onRenderFailedChange?.(true);
      });
    return () => {
      active = false;
    };
  }, [booths, onRenderFailedChange]);

  return (
    <div className={signFont.className}>
      {booths.map((booth) => (
        <section
          key={booth.id}
          // 한 부스가 한 페이지. break-after를 쓰면 마지막 장 뒤에 빈 페이지가 생길 수 있어 before로 끊는다.
          className="flex min-h-[80vh] break-before-page flex-col items-center gap-8 pt-6 text-center first:break-before-auto"
        >
          {images[booth.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- canvas가 만든 data URL이라 next/image가 처리할 수 없다
            <img
              src={images[booth.id]}
              alt=""
              className="w-[150mm] max-w-full"
            />
          ) : (
            <div className="aspect-square w-[150mm] max-w-full animate-pulse rounded bg-slate-100" />
          )}
          <h2 className="max-w-full text-5xl leading-tight break-keep wrap-anywhere">
            {booth.name}
          </h2>
          {booth.description && (
            <p className="max-w-full text-3xl break-keep wrap-anywhere text-slate-500">
              {booth.description}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
