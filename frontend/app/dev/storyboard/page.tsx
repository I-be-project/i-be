"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import flows from "./flows.json"

// 전체 시스템 스토리보드 — 학생 화면을 피그마 화이트보드처럼 흐름별 가로 줄로 늘어놓는다.
// 프레임 목록은 flows.json, 이미지는 public/storyboard/에 있다(테스트 계정 최수아로 촬영,
// 스크롤 영역까지 펼친 전체 길이).
//
// 무한 캔버스: 어디서든 끌면 이동, 휠·트랙패드 스크롤도 이동, 핀치·Ctrl(⌘)+휠은 커서 기준
// 연속 확대·축소. 프레임은 끌지 않고 놓으면(클릭) 원본 이미지를 새 탭에 연다.

const MIN_SCALE = 0.1
const MAX_SCALE = 2
const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

interface View {
  x: number
  y: number
  scale: number
}

export default function StoryboardPage() {
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 0.4 })
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // (px, py) 화면 좌표를 고정점으로 배율을 바꾼다 — 커서 아래 내용이 제자리에 머문다.
  const zoomAt = (px: number, py: number, next: (s: number) => number) =>
    setView((v) => {
      const scale = clamp(next(v.scale))
      const k = scale / v.scale
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, scale }
    })

  // React onWheel은 passive라 브라우저 확대를 막을 수 없어 직접 등록한다.
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // 마우스 휠 한 칸(±100)과 트랙패드 핀치(±수 단위)가 둘 다 자연스럽도록 한 번의 변화량을 제한한다.
        const delta = Math.max(-50, Math.min(50, e.deltaY))
        zoomAt(e.clientX, e.clientY, (s) => s * Math.exp(-delta * 0.005))
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const zoomCenter = (factor: number) =>
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, (s) => s * factor)

  return (
    <div
      ref={boardRef}
      className="fixed inset-0 cursor-grab touch-none select-none overflow-hidden bg-[#f5f5f5] active:cursor-grabbing"
      style={{
        backgroundImage: "radial-gradient(#d4d4d4 1px, transparent 1px)",
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
        d.x = e.clientX
        d.y = e.clientY
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (d && !d.moved) {
          // 포인터 캡처 중엔 e.target이 캔버스라, 손 뗀 위치의 요소를 직접 찾는다.
          const src = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-src]")?.getAttribute("data-src")
          if (src) window.open(src, "_blank", "noreferrer")
        }
      }}
    >
      <div
        className="absolute left-0 top-0 w-max origin-top-left space-y-40"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {flows.map((flow) => (
          <section key={flow.title}>
            <h2 className="mb-10 text-6xl font-black tracking-tight text-neutral-800">{flow.title}</h2>
            <div className="flex items-start">
              {flow.frames.map((frame, i) => (
                <div key={frame.src} className="flex items-start">
                  {i > 0 && <Arrow />}
                  <figure className="w-[390px]">
                    <figcaption className="mb-3 truncate text-lg font-medium text-neutral-500">
                      {frame.name}
                    </figcaption>
                    <Image
                      src={frame.src}
                      data-src={frame.src}
                      alt={`${frame.name} 화면`}
                      width={frame.size[0]}
                      height={frame.size[1]}
                      // 다시 촬영해도 최적화 캐시가 옛 이미지를 내주지 않도록 원본을 그대로 쓴다.
                      unoptimized
                      draggable={false}
                      className="h-auto w-full rounded-[28px] bg-white shadow-xl ring-1 ring-black/5"
                    />
                  </figure>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="fixed left-4 top-4 flex items-center gap-3 rounded-xl border bg-white px-4 py-2 shadow-md">
        <span className="text-sm font-semibold">전체 시스템 스토리보드</span>
        <div className="flex items-center gap-1 border-l pl-3">
          <button
            type="button"
            aria-label="축소"
            onClick={() => zoomCenter(1 / 1.25)}
            className="rounded p-1 hover:bg-muted"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-11 text-center text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            aria-label="확대"
            onClick={() => zoomCenter(1.25)}
            className="rounded p-1 hover:bg-muted"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <span className="border-l pl-3 text-xs text-muted-foreground">드래그 이동 · 핀치/⌘+휠 확대</span>
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <svg aria-hidden width="96" height="24" viewBox="0 0 96 24" className="mx-4 mt-[420px] shrink-0 text-neutral-400">
      <path d="M2 12h86m-10-8 10 8-10 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
