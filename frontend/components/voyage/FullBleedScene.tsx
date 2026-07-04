"use client";

import type { ReactNode } from "react";
import { SceneAssetImage } from "@/components/voyage/SceneAssetImage";
import type { SceneAsset } from "@/lib/assets/sceneManifest";

interface FullBleedSceneProps {
  asset: SceneAsset;
  /** 뷰포트 대비 높이 — welcome 스타일 풀블리드 */
  heightClass?: string;
  priority?: boolean;
  children?: ReactNode;
  /** 하단 스크림 (CTA·글 가독성) */
  bottomScrim?: boolean;
}

/** welcome-bg와 같은 letterbox + 풀스크린 장면 */
export function FullBleedScene({
  asset,
  heightClass = "h-[58vh] min-h-[320px]",
  priority = false,
  children,
  bottomScrim = true,
}: FullBleedSceneProps) {
  return (
    <div className={`relative w-full overflow-hidden bg-[#49a7e0] ${heightClass}`}>
      <div className="absolute inset-0">
        <SceneAssetImage asset={asset} priority={priority} sizes="100vw" />
      </div>
      {bottomScrim && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#fdf3e0]/90 via-[#fdf3e0]/40 to-transparent" />
      )}
      {children}
    </div>
  );
}
