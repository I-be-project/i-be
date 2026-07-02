import { cn } from "@/lib/utils";

// 나비섬 원정 공통 배경 — 하늘(구름·햇살·반짝임) → 바다 → 모래사장.
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

// 나비 실루엣 — 나비섬의 시그니처. 부드럽게 떠다닌다.
function Butterfly({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 20"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      {/* 왼쪽 날개 (위/아래) */}
      <path d="M11.2 9.5 C8 2.5, 0.5 2, 2.5 8.5 C3.6 12, 8.5 12.3, 11.2 9.5 Z" opacity="0.95" />
      <path d="M11.2 10.5 C8.8 13.8, 4.5 15.5, 5.5 11.8 C6.1 9.8, 9 9.6, 11.2 10.5 Z" opacity="0.75" />
      {/* 오른쪽 날개 (위/아래) */}
      <path d="M12.8 9.5 C16 2.5, 23.5 2, 21.5 8.5 C20.4 12, 15.5 12.3, 12.8 9.5 Z" opacity="0.85" />
      <path d="M12.8 10.5 C15.2 13.8, 19.5 15.5, 18.5 11.8 C17.9 9.8, 15 9.6, 12.8 10.5 Z" opacity="0.65" />
      {/* 몸통 */}
      <ellipse cx="12" cy="10" rx="0.9" ry="3.4" opacity="0.9" />
    </svg>
  );
}

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

      {/* 나비 — 시그니처. 본문 텍스트와 겹치지 않게 가장자리/상단 여백에 배치.
          soft에선 한 마리만 남긴다. */}
      {soft ? (
        <Butterfly className="animate-floaty absolute right-[7%] top-[2.5%] w-5 text-sky-400/60" />
      ) : (
        <>
          <Butterfly className="animate-floaty absolute right-[6%] top-[9%] w-6 text-sky-400/70" />
          <Butterfly
            className="animate-floaty absolute left-[5%] top-[22%] w-5 text-blue-400/50"
            style={{ animationDelay: "1.8s" }}
          />
          <Butterfly
            className="animate-floaty absolute right-[9%] top-[42%] w-4 text-white/80"
            style={{ animationDelay: "3.2s" }}
          />
        </>
      )}

      {/* 바다 반짝임 + 모래사장 글로우 — 하단 */}
      <div className={cn("absolute inset-x-0 bottom-0 h-1/3", soft && "opacity-70")}>
        <div className="absolute -bottom-12 left-1/2 h-48 w-[150%] -translate-x-1/2 rounded-[100%] bg-[#fbe9c8]/70 blur-3xl" />
        <div className="absolute bottom-[18%] left-[6%] h-16 w-64 rounded-[100%] bg-[#bfe3fb]/60 blur-2xl" />
        <div className="absolute bottom-[24%] right-[4%] h-14 w-52 rounded-[100%] bg-white/50 blur-2xl" />
      </div>
    </div>
  );
}
