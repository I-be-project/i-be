"use client";

import { useState } from "react";
import Image from "next/image";
import { Map } from "lucide-react";
import { HanmadangBackground } from "@/components/tabs/HanmadangBackground";

// 부스맵 에셋 경로를 한곳에 모아둔다 — 나중에 이 파일만 public/에 넣으면 바로 완성된다.
const BOOTH_MAP_IMAGE_SRC = "/booth-map.webp";

export default function HomePage() {
  // 에셋이 아직 없으면 next/image가 404를 내므로, 실패 시 플레이스홀더로 전환한다.
  const [mapFailed, setMapFailed] = useState(false);

  return (
    <main className="relative flex min-h-[100dvh] flex-col px-5 pb-28 pt-8 font-sans">
      <HanmadangBackground />

      <div className="relative z-10 flex flex-col gap-6">
        <Image
          src="/logo-hanmadang.png"
          alt="제12회 청소년 나Be한마당"
          width={720}
          height={523}
          priority
          className="h-16 w-auto self-start"
        />

        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-hm-blue">부스맵</h1>
          <p className="mt-1.5 text-sm font-bold text-hm-blue/60">
            한마당 현장에서 돌아볼 부스들을 지도로 확인해봐.
          </p>
        </div>

        <section className="hm-card overflow-hidden">
          {mapFailed ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Map className="h-9 w-9 text-hm-teal" />
              <p className="text-sm font-bold text-hm-blue">지도 준비 중이에요.</p>
              <p className="text-xs font-bold text-hm-blue/50">
                한마당 당일 부스맵이 여기에 표시될 거야.
              </p>
            </div>
          ) : (
            <div className="relative aspect-[4/3] w-full bg-hm-tint">
              <Image
                src={BOOTH_MAP_IMAGE_SRC}
                alt="나Be한마당 부스맵"
                fill
                sizes="(min-width: 672px) 672px, 100vw"
                className="object-cover"
                onError={() => setMapFailed(true)}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
