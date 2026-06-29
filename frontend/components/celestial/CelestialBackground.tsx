import { cn } from "@/lib/utils";

// 별 위치는 하이드레이션 불일치를 피하려고 고정 배열로 둔다(Math.random 미사용).
const STARS: { x: number; y: number; r: number; delay: number }[] = [
  { x: 8, y: 12, r: 1.5, delay: 0 },
  { x: 18, y: 28, r: 1, delay: 0.6 },
  { x: 26, y: 9, r: 2, delay: 1.2 },
  { x: 34, y: 20, r: 1, delay: 0.3 },
  { x: 44, y: 7, r: 1.5, delay: 1.8 },
  { x: 56, y: 14, r: 1, delay: 0.9 },
  { x: 67, y: 8, r: 2, delay: 2.1 },
  { x: 78, y: 18, r: 1.5, delay: 0.4 },
  { x: 89, y: 11, r: 1, delay: 1.5 },
  { x: 92, y: 30, r: 1.5, delay: 2.4 },
  { x: 6, y: 38, r: 1, delay: 1.1 },
  { x: 14, y: 52, r: 1.5, delay: 0.7 },
  { x: 84, y: 44, r: 1, delay: 1.9 },
  { x: 94, y: 56, r: 1.5, delay: 0.2 },
  { x: 4, y: 62, r: 1, delay: 1.4 },
  { x: 72, y: 33, r: 1, delay: 2.6 },
  { x: 50, y: 26, r: 1, delay: 1.7 },
  { x: 38, y: 40, r: 1.5, delay: 0.5 },
  { x: 62, y: 48, r: 1, delay: 2.2 },
  { x: 22, y: 64, r: 1, delay: 1.3 },
];

// 별자리(연결선 + 노드). 각자 고정 크기의 작은 SVG로 그려 비율을 유지한다
// (화면 전체로 늘리지 않으므로 원이 타원으로 찌그러지지 않음). 위치만 %로 배치.
const CONSTELLATIONS: {
  pos: React.CSSProperties;
  w: number;
  vb: string;
  nodes: { x: number; y: number }[];
}[] = [
  {
    pos: { top: "26%", left: "2%" },
    w: 96,
    vb: "0 0 70 92",
    nodes: [
      { x: 8, y: 8 },
      { x: 32, y: 30 },
      { x: 14, y: 54 },
      { x: 42, y: 66 },
    ],
  },
  {
    pos: { top: "9%", right: "4%" },
    w: 108,
    vb: "0 0 84 72",
    nodes: [
      { x: 6, y: 10 },
      { x: 34, y: 22 },
      { x: 20, y: 46 },
      { x: 58, y: 30 },
      { x: 74, y: 56 },
    ],
  },
];

export function CelestialBackground({
  className,
  variant = "hero",
}: {
  className?: string;
  variant?: "hero" | "soft";
}) {
  // soft: 폼/설문 화면용. 옅은 배경 + 별 적게 + 별자리 생략으로 차분하게.
  const soft = variant === "soft";
  const stars = soft ? STARS.slice(0, 8) : STARS;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        soft ? "bg-celestial-soft" : "bg-celestial",
        className,
      )}
    >
      {/* 별자리 — hero에서만. 각각 고정 비율의 작은 SVG (찌그러짐 방지) */}
      {!soft &&
        CONSTELLATIONS.map((c, ci) => (
          <svg
            key={ci}
            className="absolute"
            style={{ ...c.pos, width: c.w, height: "auto" }}
            viewBox={c.vb}
            fill="none"
          >
            <polyline
              points={c.nodes.map((n) => `${n.x},${n.y}`).join(" ")}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="0.7"
            />
            {c.nodes.map((n, ni) => (
              <circle key={ni} cx={n.x} cy={n.y} r="1.4" fill="rgba(255,255,255,0.85)" />
            ))}
          </svg>
        ))}

      {/* 반짝이는 별 */}
      <div className={cn(soft && "opacity-70")}>
        {stars.map((s, i) => (
          <span
            key={i}
            className="animate-twinkle absolute rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.r * 2}px`,
              height: `${s.r * 2}px`,
              animationDelay: `${s.delay}s`,
              boxShadow: soft ? "0 0 4px rgba(255,255,255,0.7)" : "0 0 6px rgba(255,255,255,0.9)",
            }}
          />
        ))}
      </div>

      {/* 떠다니는 파스텔 오브 + 하단 글로우 (soft에선 더 옅게) */}
      <div className={cn("absolute inset-0", soft && "opacity-50")}>
        <div className="animate-drift absolute left-[6%] top-[16%] h-16 w-16 rounded-full bg-white/30 blur-2xl" />
        <div
          className="animate-drift absolute right-[8%] top-[40%] h-24 w-24 rounded-full bg-pink-200/30 blur-2xl"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="animate-drift absolute left-[12%] bottom-[28%] h-20 w-20 rounded-full bg-indigo-200/30 blur-2xl"
          style={{ animationDelay: "4s" }}
        />

        <div className="absolute inset-x-0 bottom-0 h-1/3">
          <div className="absolute -bottom-12 left-1/2 h-48 w-[150%] -translate-x-1/2 rounded-[100%] bg-[#fcdcc6]/60 blur-3xl" />
          <div className="absolute bottom-0 left-[6%] h-28 w-72 rounded-[100%] bg-[#f6c9da]/55 blur-3xl" />
          <div className="absolute -bottom-4 right-[4%] h-24 w-64 rounded-[100%] bg-white/45 blur-3xl" />
        </div>
      </div>
    </div>
  );
}
