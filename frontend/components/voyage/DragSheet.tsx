"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useDragControls,
  useReducedMotion,
  animate,
} from "framer-motion";
import { ChevronUp } from "lucide-react";

const SHEET_SPRING = { type: "spring" as const, stiffness: 360, damping: 40 };
// 기본(쉬는) 상태에서 화면 아래로부터 항상 보이는 비율 — 하단 40%는 접어도 계속 올라와 있다.
const DEFAULT_VISIBLE_RATIO = 0.4;

const SHEET_BACKGROUND =
  "linear-gradient(to bottom, rgba(253,243,224,0) 0px, rgba(253,243,224,0.6) 52px, #fdf3e0 104px, #fffbf3 100%)";

// 기본 상태로 화면 하단 40%만큼 이미 올라와 있고, 위로 밀어 올리면 전체가 드러나고
// 다시 아래로 밀면 기본(40%) 위치로 돌아가는 바텀시트(threshold 초과/강한 velocity로 스냅).
// explore/questions/page.tsx의 QuestionScene 드래그 로직을 다른 브릿지 화면에서도 쓰기 위해 뽑아냄.
export function DragSheet({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [restY, setRestY] = useState(0);
  const [open, setOpen] = useState(false);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const ry = Math.max(el.offsetHeight - vh * DEFAULT_VISIBLE_RATIO, 0);
      setRestY(ry);
      if (!inited.current) {
        y.set(ry);
        inited.current = true;
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inited.current) return;
    const controls = animate(y, open ? 0 : restY, SHEET_SPRING);
    return () => controls.stop();
  }, [open, restY, y]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center">
      <motion.div
        ref={sheetRef}
        style={{ y, background: SHEET_BACKGROUND }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: restY }}
        dragElastic={{ top: 0.02, bottom: 0.15 }}
        onPointerDown={(e) => {
          // 버튼·링크 등 상호작용 요소를 누른 경우엔 드래그를 시작하지 않는다(클릭 방해 방지).
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, textarea, select, [data-no-drag]")) return;
          dragControls.start(e);
        }}
        onDragEnd={(_, info) => {
          const draggedUp = restY - y.get();
          const threshold = Math.min(restY * 0.3, 130);
          const stayOpen =
            info.velocity.y < -650
              ? true
              : info.velocity.y > 650
                ? false
                : draggedUp > threshold;
          setOpen(stayOpen);
          animate(y, stayOpen ? 0 : restY, SHEET_SPRING);
        }}
        className="flex w-full max-w-2xl touch-none select-none flex-col rounded-t-3xl"
      >
        <div className="flex flex-shrink-0 cursor-grab justify-center pb-1 pt-4 active:cursor-grabbing">
          <motion.div
            className="flex flex-col items-center justify-center text-ink"
            animate={reduce || open ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronUp
              className={`-mb-3 h-6 w-6 transition-transform ${open ? "rotate-180" : ""}`}
              strokeWidth={2.8}
            />
            <ChevronUp
              className={`h-6 w-6 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
              strokeWidth={2.8}
            />
          </motion.div>
        </div>

        <div className="flex flex-col px-6">{children}</div>
      </motion.div>
    </div>
  );
}
