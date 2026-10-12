"use client";

import Image from "next/image";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { getBoothMapLocation } from "@/lib/boothMap";
import type { ProfileBoothStatus } from "@/lib/api";
import { SOFT_CARD } from "./BoothList";

export function BoothMap({ booth, onReset }: { booth: ProfileBoothStatus | null; onReset: () => void }) {
  const [failed, setFailed] = useState(false);
  const location = booth ? getBoothMapLocation(booth.name) : null;
  const center = location?.points[0];
  const scale = center ? 2.2 : 1;
  return <section className={`${SOFT_CARD} overflow-hidden`} aria-label="부스 지도">
    {location && booth && <div className="flex items-center justify-between gap-3 px-4 py-3" aria-live="polite">
      <div className="min-w-0"><p className="text-xs font-bold text-hm-blue/65">{location.label}</p><h2 className="mt-1 break-keep text-sm font-extrabold text-hm-blue">{booth.name}</h2></div>
      <button type="button" onClick={onReset} className="min-h-11 shrink-0 rounded-xl bg-hm-blue/5 px-3 text-xs font-bold text-hm-blue">전체 지도</button>
    </div>}
    {failed ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-hm-blue"><p className="text-sm font-bold">지도를 준비하고 있어</p><p className="text-xs text-hm-blue/60">아래 목록에서 체험할 부스를 먼저 찾아봐.</p></div> : <div className="relative aspect-[5250/5670] w-full overflow-hidden">
      {/* Image and markers share one coordinate frame, including when zoomed. */}
      <div className="absolute" style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, left: center ? `${50 - center.x * scale * 100}%` : "0", top: center ? `${50 - center.y * scale * 100}%` : "0" }}>
        <Image src="/event-venue-map.png" alt="나Be한마당 부스 배치도" fill sizes={center ? "(min-width: 672px) 1390px, 220vw" : "(min-width: 672px) 632px, 100vw"} className="object-contain" onError={() => setFailed(true)} />
        {location?.points.map((point, index) => <div key={point.number ?? "facility"} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, width: `${40 / 1510 * 100}%`, height: `${40 / 1632 * 100}%` }}>
          <span className="absolute inset-0 rounded-md border-2 border-hm-blue shadow-[0_0_0_2px_rgba(255,255,255,0.85)]" />
          {index === 0 && <span className="absolute bottom-full left-1/2 mb-2 flex w-max max-w-[240px] -translate-x-1/2 items-center gap-1 rounded-xl bg-hm-blue px-3 py-2 text-xs font-extrabold text-white shadow-lg"><MapPin size={15} className="shrink-0" aria-hidden="true" /><span className="break-keep text-center">{booth?.name}</span></span>}
        </div>)}
      </div>
    </div>}
  </section>;
}
