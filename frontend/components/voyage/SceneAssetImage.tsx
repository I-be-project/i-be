"use client";

import Image from "next/image";
import { useState } from "react";
import type { SceneAsset } from "@/lib/assets/sceneManifest";

interface SceneAssetImageProps {
  asset: SceneAsset;
  className?: string;
  priority?: boolean;
  sizes?: string;
  fill?: boolean;
}

/** PNG 우선, 실패 시 SVG 폴백 — 없으면 부모 배경(SVG 장면) 노출 */
export function SceneAssetImage({
  asset,
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 100vw, 400px",
  fill = true,
}: SceneAssetImageProps) {
  const [src, setSrc] = useState(asset.src);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <Image
      src={src}
      alt={asset.alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
      onError={() => {
        if (asset.fallbackSrc && src !== asset.fallbackSrc) {
          setSrc(asset.fallbackSrc);
          return;
        }
        setHidden(true);
      }}
    />
  );
}
