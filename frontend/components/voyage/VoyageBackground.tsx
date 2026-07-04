import { cn } from "@/lib/utils";

// 나로섬 원정 공통 배경 — 하늘(구름·햇살·반짝임) → 바다 → 모래사장.
// 모든 장식은 고정 좌표(하이드레이션 불일치 방지, Math.random 미사용).
// variant:
//   bright — 도착·발견 등 "장면" 화면용 (브리핑/해석/결과/카드)
//   soft   — 폼·설문 등 읽기 위주 화면용 (장식을 줄여 가독성 확보)

const SPARKLES: { x: number; y: number; r: number; delay: number }[] = [
  { x: 10, y: 8, r: 1.5, delay: 0 },
  { x: 22, y: 18, r: 1, delay: 0.8 },
  { x: 36, y: 6, r: 2, delay: 1.4 },
  { x: 52, y: 14, r: 1, delay: 0.4 },
  { x: 66, y: 7, r: 1.5, delay: 2.0 },
  { x: 80, y: 16, r: 1, delay: 1.1 },
  { x: 91, y: 9, r: 1.5, delay: 0.6 },
  { x: 6, y: 26, r: 1, delay: 1.7 },
  { x: 88, y: 28, r: 1, delay: 2.3 },
  { x: 45, y: 22, r: 1, delay: 1.0 },
];

export function VoyageBackground({
  className,
  variant = "bright",
}: {
  className?: string;
  variant?: "bright" | "soft";
}) {
  const soft = variant === "soft";
  const sparkles = soft ? SPARKLES.slice(0, 5) : SPARKLES;

  return (
    <div
      aria-hidden
      className={cn(
        "bg-voyage pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {/* 햇살 — 오른쪽 위 */}
      <div
        className={cn(
          "absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-b from-amber-100/80 to-transparent blur-2xl",
          soft && "opacity-60",
        )}
      />

      {/* 구름 — 흐르는 흰 덩어리 */}
      <div className={cn("absolute inset-0", soft && "opacity-60")}>
        <div className="animate-drift absolute left-[8%] top-[10%] h-10 w-36 rounded-full bg-white/60 blur-xl" />
        <div
          className="animate-drift absolute right-[12%] top-[22%] h-8 w-28 rounded-full bg-white/50 blur-xl"
          style={{ animationDelay: "3s" }}
        />
        <div
          className="animate-drift absolute left-[24%] top-[32%] h-8 w-24 rounded-full bg-white/40 blur-xl"
          style={{ animationDelay: "6s" }}
        />
      </div>

      {/* 반짝임 — 하늘의 빛 알갱이 */}
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="animate-twinkle absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.r * 2}px`,
            height: `${s.r * 2}px`,
            animationDelay: `${s.delay}s`,
            boxShadow: "0 0 5px rgba(255,255,255,0.8)",
          }}
        />
      ))}

      {/* 바다 반짝임 + 모래사장 글로우 — 하단 */}
      <div className={cn("absolute inset-x-0 bottom-0 h-1/3", soft && "opacity-70")}>
        <div className="absolute -bottom-12 left-1/2 h-48 w-[150%] -translate-x-1/2 rounded-[100%] bg-[#fbe9c8]/70 blur-3xl" />
        <div className="absolute bottom-[18%] left-[6%] h-16 w-64 rounded-[100%] bg-[#bfe3fb]/60 blur-2xl" />
        <div className="absolute bottom-[24%] right-[4%] h-14 w-52 rounded-[100%] bg-white/50 blur-2xl" />
      </div>
    </div>
  );
}
