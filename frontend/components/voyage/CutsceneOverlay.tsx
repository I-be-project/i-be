"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SceneAssetImage } from "@/components/voyage/SceneAssetImage";
import type { SceneAsset } from "@/lib/assets/sceneManifest";

interface CutsceneOverlayProps {
  asset: SceneAsset | null;
  onDone: () => void;
  durationMs?: number;
}

/** 질문 전환 컷신 — reduced-motion이면 즉시 완료 */
export function CutsceneOverlay({
  asset,
  onDone,
  durationMs = 1200,
}: CutsceneOverlayProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!asset) return;
    if (reduce) {
      onDone();
      return;
    }
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
  }, [asset, durationMs, onDone, reduce]);

  if (!asset || reduce) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={asset.id}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d3047]/40 p-6 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <motion.div
          className="relative aspect-[16/10] w-full max-w-md overflow-hidden rounded-3xl border border-solid border-white/60 shadow-[0_24px_60px_rgba(13,48,71,0.45)]"
          initial={{ scale: 0.92, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#c9e5fa] via-[#79c0e8] to-[#fdf3e0]" />
          <SceneAssetImage asset={asset} className="z-10" priority />
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0d3047]/75 to-transparent px-5 pb-5 pt-12">
            <p className="text-center text-sm font-bold text-white drop-shadow">
              {asset.alt}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
