"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  animate,
  useMotionValue,
  useTransform,
  useDragControls,
} from "framer-motion";
import { Info, X } from "lucide-react";
import { welcomeAbout } from "@/lib/data/welcomeAbout";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 42 };

// CTA 버튼 위에 두는 작은 "체험 안내" 칩. 탭하면 안내 시트가 올라온다.
export function AboutChip({
  onOpen,
  className = "",
}: {
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="체험 안내"
      className={
        "inline-flex items-center justify-center p-1 text-sky-600 drop-shadow-[0_1px_4px_rgba(255,255,255,0.85)] transition-all hover:text-sky-500 active:scale-[0.94] " +
        className
      }
    >
      <Info className="h-8 w-8" strokeWidth={2.4} />
    </button>
  );
}

// 아래에서 올라오는 "체험 안내" 바텀시트(controlled).
// 손잡이를 아래로 쓸어내리면 손가락을 따라 연속적으로 닫힌다.
export function AboutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [closedY, setClosedY] = useState(800);

  const y = useMotionValue(800);
  const dragControls = useDragControls();
  const backdrop = useTransform(y, [0, closedY], [0.4, 0]);

  // 시트 전체 높이를 측정해 "닫힘 위치(화면 밖으로 내린 거리)"로 쓴다.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const cy = el.offsetHeight;
      setClosedY(cy);
      if (!inited.current) {
        y.set(open ? 0 : cy);
        inited.current = true;
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // open 상태가 바뀌면 열림(0)/닫힘(closedY)으로 스냅.
  useEffect(() => {
    if (!inited.current) return;
    const controls = animate(y, open ? 0 : closedY, SPRING);
    return () => controls.stop();
  }, [open, closedY, y]);

  // 열렸을 때 Esc로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* 배경 딤 — 시트가 내려가는 만큼 함께 옅어진다 */}
      <motion.div
        aria-hidden
        onClick={() => onOpenChange(false)}
        style={{ opacity: backdrop, pointerEvents: open ? "auto" : "none" }}
        className="fixed inset-0 z-40 bg-black"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={welcomeAbout.title}
        style={{ y }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: closedY }}
        dragElastic={{ top: 0.02, bottom: 0.3 }}
        onDragEnd={(_, info) => {
          const stayOpen =
            info.velocity.y > 350
              ? false
              : info.velocity.y < -350
                ? true
                : y.get() < closedY / 3;
          onOpenChange(stayOpen);
          animate(y, stayOpen ? 0 : closedY, SPRING);
        }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col rounded-t-3xl border-t border-white/60 bg-white shadow-[0_-10px_40px_rgba(14,58,79,0.18)]"
      >
        {/* 손잡이 — 여기서만 드래그 시작(본문 스크롤과 충돌 방지) */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex flex-shrink-0 cursor-grab touch-none select-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-ink/15" />
        </div>

        {/* 헤더 */}
        <div className="relative flex-shrink-0 border-b border-ink/10 px-6 pt-1 pb-4">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-600">
            <Info className="h-3.5 w-3.5" strokeWidth={2.4} />
            {welcomeAbout.subtitle}
          </div>
          <h2 className="text-xl font-black text-ink">{welcomeAbout.title}</h2>
          <p className="mt-0.5 text-sm font-medium text-ink-muted">
            {welcomeAbout.intro}
          </p>
          <button
            type="button"
            aria-label={welcomeAbout.close}
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-5">
            {welcomeAbout.sections.map((s) => (
              <div key={s.title}>
                <p className="mb-1.5 text-[15px] font-extrabold text-ink">
                  {s.title}
                </p>
                <p className="text-[15px] font-medium leading-relaxed text-ink-muted">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}
