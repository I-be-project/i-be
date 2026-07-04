"use client";

// 나로섬 원정 장면 시스템 — Q1~6을 "하루의 원정"으로 연출한다.
// 장면 1(아침 선착장) → 2(한낮 캠프) → 3(궂은 오후) → 4(오후 키트 점검)
// → 5(노을 갈림길) → 6(해질녘 신호). 질문이 넘어갈 때마다 하늘 무드가
// 크로스페이드되고, 장면 창의 일러스트가 교체된다. CSS/SVG로만 구현.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MapPin } from "lucide-react";
import { useEffect } from "react";

export type SceneId = 1 | 2 | 3 | 4 | 5 | 6;

// 여정 전체가 공유하는 하늘 무드. Q1~6은 장면 번호, 그 밖의 화면은 이름으로 쓴다.
// 브리핑(morning) → Q1~6(하루) → 심화 Q7~10(night) → 해석(deepNight) → 결과·카드(sunrise)
export type VoyageMood = SceneId | "morning" | "night" | "deepNight" | "sunrise";

// page는 화면 전체 배경 — 끝색은 언제나 모래 #fdf3e0 (하단 CTA 스크림과 일치).
// window는 장면 창의 하늘 (Q1~6 전용).
const MOODS: Record<VoyageMood, { page: string; window?: string }> = {
  morning: {
    page: "linear-gradient(175deg,#c9e5fa 0%,#d8eefb 45%,#fdf3e0 100%)",
  },
  1: {
    page: "linear-gradient(175deg,#c9e5fa 0%,#d8eefb 45%,#fdf3e0 100%)",
    window: "linear-gradient(180deg,#9ed1f5 0%,#cfeafc 100%)",
  },
  2: {
    page: "linear-gradient(175deg,#aeddf8 0%,#cdeafa 45%,#fdf3e0 100%)",
    window: "linear-gradient(180deg,#7ec6f2 0%,#c6e7fa 100%)",
  },
  3: {
    page: "linear-gradient(175deg,#a3b8cc 0%,#c3d0da 50%,#f2ecda 100%)",
    window: "linear-gradient(180deg,#7f95ab 0%,#b4c4d1 100%)",
  },
  4: {
    page: "linear-gradient(175deg,#a5d3ef 0%,#cae5f2 45%,#fdf3e0 100%)",
    window: "linear-gradient(180deg,#8cc4e8 0%,#cde8f4 100%)",
  },
  5: {
    page: "linear-gradient(175deg,#b1c3e0 0%,#f2cfa6 55%,#fdf3e0 100%)",
    window: "linear-gradient(180deg,#9fb0d6 0%,#f6c98e 100%)",
  },
  6: {
    page: "linear-gradient(175deg,#7e97ba 0%,#b0a6c2 40%,#eccfa6 100%)",
    window: "linear-gradient(180deg,#41618c 0%,#8d7fa6 70%,#d8a56e 100%)",
  },
  night: {
    page: "linear-gradient(175deg,#7a8fb4 0%,#988fb8 40%,#ecd2ab 75%,#fdf3e0 100%)",
  },
  deepNight: {
    page: "linear-gradient(175deg,#71869f 0%,#8d87b0 45%,#e6cda9 80%,#fdf3e0 100%)",
  },
  sunrise: {
    page: "linear-gradient(175deg,#9db4dd 0%,#f0c8a4 55%,#fdf3e0 100%)",
  },
};

const isNight = (m: VoyageMood) => m === 6 || m === "night" || m === "deepNight";

// page 그라데이션의 첫 색 = 화면 최상단(상태바와 맞닿는) 색.
const topColor = (m: VoyageMood) =>
  MOODS[m].page.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#c9e5fa";

const NIGHT_STARS = [
  { x: 12, y: 6, d: 0 },
  { x: 30, y: 12, d: 0.9 },
  { x: 55, y: 5, d: 1.6 },
  { x: 74, y: 10, d: 0.4 },
  { x: 90, y: 7, d: 2.1 },
  { x: 44, y: 16, d: 1.2 },
  { x: 8, y: 20, d: 1.9 },
  { x: 64, y: 22, d: 0.6 },
];

// 화면 전체 배경 — 무드가 바뀌면 하늘이 부드럽게 넘어간다.
export function ExpeditionBackdrop({ mood }: { mood: VoyageMood }) {
  const reduce = useReducedMotion();

  // 다이나믹 아일랜드/상태바 영역이 현재 씬의 하늘색과 어우러지도록
  // theme-color 메타를 씬별로 갱신한다. 화면을 떠날 때는 이전 값으로 복원.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.content;
    meta.content = topColor(mood);
    return () => {
      meta.content = prev;
    };
  }, [mood]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={String(mood)}
          className="absolute inset-0"
          style={{ background: MOODS[mood].page }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />
      </AnimatePresence>

      {/* 햇살(낮) — 오른쪽 위 */}
      {!isNight(mood) && mood !== 3 && (
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-b from-amber-100/80 to-transparent blur-2xl" />
      )}

      {/* 구름 */}
      <div className="animate-drift absolute left-[8%] top-[6%] h-9 w-32 rounded-full bg-white/50 blur-xl" />
      <div
        className="animate-drift absolute right-[10%] top-[15%] h-7 w-24 rounded-full bg-white/40 blur-xl"
        style={{ animationDelay: "3s" }}
      />

      {/* 궂은 날씨(장면 3): 화면 전체에 옅은 빗줄기 */}
      {mood === 3 && !reduce && <BackdropRain />}

      {/* 밤 무드: 별이 뜬다 */}
      {isNight(mood) &&
        NIGHT_STARS.slice(0, mood === 6 ? 6 : 8).map((s, i) => (
          <span
            key={i}
            className="animate-twinkle absolute h-[3px] w-[3px] rounded-full bg-white"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              animationDelay: `${s.d}s`,
              boxShadow: "0 0 5px rgba(255,255,255,0.9)",
            }}
          />
        ))}

      {/* 모래사장 글로우 — 하단 */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 opacity-70">
        <div className="absolute -bottom-12 left-1/2 h-48 w-[150%] -translate-x-1/2 rounded-[100%] bg-[#fbe9c8]/70 blur-3xl" />
      </div>
    </div>
  );
}

const RAIN_DROPS = [
  { x: 6, delay: 0 },
  { x: 18, delay: 0.5 },
  { x: 31, delay: 0.2 },
  { x: 45, delay: 0.8 },
  { x: 58, delay: 0.35 },
  { x: 70, delay: 0.95 },
  { x: 83, delay: 0.15 },
  { x: 93, delay: 0.6 },
];

function BackdropRain() {
  return (
    <div className="absolute inset-0">
      {RAIN_DROPS.map((d, i) => (
        <motion.span
          key={i}
          className="absolute h-5 w-px rotate-[14deg] rounded-full bg-white/45"
          style={{ left: `${d.x}%` }}
          initial={{ top: "-6%", opacity: 0 }}
          animate={{ top: "106%", opacity: [0, 0.9, 0.9, 0] }}
          transition={{
            duration: 1.6,
            delay: d.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// 장면 창 — 질문 위에 놓이는 일러스트 패널. 스토리의 "지금 장면"을 보여준다.
// 진행도(step/total)를 창 안의 작은 칩으로 함께 담아 별도 진행 헤더를 없앤다.
export function SceneWindow({
  scene,
  label,
  step,
  total,
}: {
  scene: SceneId;
  label?: string;
  step?: number;
  total?: number;
}) {
  return (
    <div
      className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-solid border-white/70 shadow-[0_10px_28px_rgba(37,99,235,0.15)]"
      style={{ background: MOODS[scene].window }}
    >
      {label && (
        <div className="glass-card absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-ink">
          <MapPin className="h-3 w-3 text-sky-600" />
          장면 {scene} · {label}
        </div>
      )}
      {step !== undefined && total !== undefined && (
        <div className="glass-card absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
          {step}/{total}
        </div>
      )}
      <SceneArt scene={scene} />
    </div>
  );
}

function SceneArt({ scene }: { scene: SceneId }) {
  const reduce = useReducedMotion();
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 -36 360 148"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
    >
      {scene !== 6 && <SkyClouds reduce={!!reduce} dim={scene === 3} />}
      {scene === 1 && <SceneDock reduce={!!reduce} />}
      {scene === 2 && <SceneCamp reduce={!!reduce} />}
      {scene === 3 && <SceneStorm reduce={!!reduce} />}
      {scene === 4 && <SceneKit reduce={!!reduce} />}
      {scene === 5 && <SceneFork reduce={!!reduce} />}
      {scene === 6 && <SceneSignal reduce={!!reduce} />}
    </svg>
  );
}

/* ── 공통 파츠 ─────────────────────────────────────────── */

// 넓어진 하늘 위를 천천히 흐르는 구름
function SkyClouds({ reduce, dim }: { reduce: boolean; dim?: boolean }) {
  return (
    <motion.g
      fill={dim ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)"}
      animate={reduce ? undefined : { x: [0, 14, 0] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="150" cy="-14" rx="26" ry="8" />
      <ellipse cx="172" cy="-19" rx="18" ry="6" />
      <ellipse cx="248" cy="-2" rx="20" ry="6" opacity="0.7" />
    </motion.g>
  );
}

const CALM_WAVE =
  "M-40 82 Q -28 78, -16 82 T 8 82 T 32 82 T 56 82 T 80 82 T 104 82 T 128 82 T 152 82 T 176 82 T 200 82 T 224 82 T 248 82 T 272 82 T 296 82 T 320 82 T 344 82 T 368 82 T 392 82 T 416 82";
const CHOPPY_WAVE =
  "M-40 80 Q -30 74, -20 80 T 0 80 T 20 80 T 40 80 T 60 80 T 80 80 T 100 80 T 120 80 T 140 80 T 160 80 T 180 80 T 200 80 T 220 80 T 240 80 T 260 80 T 280 80 T 300 80 T 320 80 T 340 80 T 360 80 T 380 80 T 400 80 T 420 80";

function Sea({
  fill,
  choppy,
  reduce,
}: {
  fill: string;
  choppy?: boolean;
  reduce: boolean;
}) {
  return (
    <g>
      <rect x="-40" y="76" width="440" height="40" fill={fill} />
      <motion.path
        d={choppy ? CHOPPY_WAVE : CALM_WAVE}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={reduce ? undefined : { x: [0, -24, 0] }}
        transition={{ duration: choppy ? 3.2 : 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.path
        d={choppy ? CHOPPY_WAVE : CALM_WAVE}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="2"
        strokeLinecap="round"
        transform="translate(12 10)"
        animate={reduce ? undefined : { x: [-16, 8, -16] }}
        transition={{ duration: choppy ? 4 : 7.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </g>
  );
}

function Sun({ cx, cy, color = "#ffd88f" }: { cx: number; cy: number; color?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="22" fill={color} opacity="0.35" />
      <circle cx={cx} cy={cy} r="13" fill={color} />
    </g>
  );
}

function Gulls() {
  return (
    <g stroke="#4c6a82" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8">
      <path d="M212 30 q 5 -6 10 0 q 5 -6 10 0" />
      <path d="M245 42 q 4 -5 8 0 q 4 -5 8 0" />
    </g>
  );
}

/* ── 장면 1: 아침 — 나로섬 선착장 ─────────────────────── */

function SceneDock({ reduce }: { reduce: boolean }) {
  return (
    <g>
      <Sun cx={294} cy={32} />
      {/* 멀리 보이는 나로섬 */}
      <path d="M236 76 q 20 -16 44 -13 q 24 3 38 13 Z" fill="#9ccab0" />
      <Sea fill="#79c0e8" reduce={reduce} />
      {/* 선착장 */}
      <g>
        <rect x="14" y="80" width="5" height="20" fill="#8a6844" />
        <rect x="46" y="80" width="5" height="22" fill="#8a6844" />
        <rect x="78" y="80" width="5" height="24" fill="#8a6844" />
        <rect x="0" y="72" width="104" height="8" rx="3" fill="#b98a5a" />
      </g>
      {/* 출렁이는 배 */}
      <motion.g
        animate={reduce ? undefined : { y: [0, -6, 0], rotate: [0, -2.5, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: 0.5, originY: 1 }}
      >
        <rect x="153" y="52" width="3" height="32" fill="#6b4a33" />
        <path d="M158 54 L158 78 L186 78 Z" fill="#fef7ec" />
        <path d="M126 82 L188 82 L178 97 L136 97 Z" fill="#e8734a" />
        <rect x="126" y="80" width="62" height="4" rx="2" fill="#c95f39" />
      </motion.g>
      <Gulls />
    </g>
  );
}

/* ── 장면 2: 한낮 — 베이스캠프, 역할 정하기 ───────────── */

function SceneCamp({ reduce }: { reduce: boolean }) {
  return (
    <g>
      <Sun cx={294} cy={30} />
      {/* 땅 + 풀밭 */}
      <rect x="-10" y="82" width="380" height="32" fill="#edd9a3" />
      <ellipse cx="130" cy="86" rx="120" ry="10" fill="#b9dc9c" />
      {/* 텐트 두 동 */}
      <g>
        <path d="M52 94 L84 50 L116 94 Z" fill="#f28d6a" />
        <path d="M76 94 L84 68 L92 94 Z" fill="#d9633f" />
        <path d="M150 94 L176 58 L202 94 Z" fill="#6db3e8" />
        <path d="M170 94 L176 74 L182 94 Z" fill="#4c92c9" />
      </g>
      {/* 펄럭이는 팀 깃발 */}
      <rect x="252" y="38" width="3.5" height="56" fill="#8a6844" />
      <motion.path
        d="M256 40 L298 48 L256 57 Z"
        fill="#ff9f4a"
        animate={reduce ? undefined : { rotate: [0, 7, 0, -5, 0], scaleX: [1, 0.9, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: 0, originY: 0.5 }}
      />
      {/* 모닥불 자리(돌) */}
      <g fill="#c9b489">
        <circle cx="228" cy="92" r="4" />
        <circle cx="238" cy="94" r="3.5" />
        <circle cx="233" cy="97" r="3" />
      </g>
    </g>
  );
}

/* ── 장면 3: 궂은 오후 — 날씨가 바뀐다 ────────────────── */

function SceneStorm({ reduce }: { reduce: boolean }) {
  return (
    <g>
      <Sea fill="#5b87ad" choppy reduce={reduce} />
      {/* 먹구름 */}
      <motion.g
        animate={reduce ? undefined : { x: [0, 18, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <g fill="#5f7590">
          <ellipse cx="80" cy="28" rx="42" ry="16" />
          <ellipse cx="116" cy="22" rx="30" ry="13" />
          <ellipse cx="52" cy="22" rx="24" ry="11" />
        </g>
        <g fill="#7a90a8">
          <ellipse cx="250" cy="36" rx="46" ry="15" />
          <ellipse cx="288" cy="30" rx="28" ry="12" />
        </g>
      </motion.g>
      {/* 빗줄기 */}
      {!reduce &&
        [56, 78, 100, 226, 252, 278].map((x, i) => (
          <motion.line
            key={x}
            x1={x}
            y1={40}
            x2={x - 4}
            y2={52}
            stroke="#d7e6f2"
            strokeWidth="2.2"
            strokeLinecap="round"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: [0, 50], opacity: [0, 1, 0] }}
            transition={{
              duration: 0.9,
              delay: i * 0.14,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
    </g>
  );
}

/* ── 장면 4: 오후 — 부족한 탐험 키트 점검 ─────────────── */

function SceneKit({ reduce }: { reduce: boolean }) {
  return (
    <g>
      {/* 옅은 해 (비 갠 뒤) */}
      <Sun cx={294} cy={32} color="#ffe3ad" />
      <rect x="-10" y="80" width="380" height="32" fill="#eed9a5" />
      {/* 돗자리 */}
      <rect x="76" y="86" width="168" height="18" rx="6" fill="#e3b877" />
      {/* 배낭 */}
      <g>
        <rect x="96" y="52" width="42" height="36" rx="9" fill="#e8734a" />
        <rect x="96" y="48" width="42" height="15" rx="7" fill="#d9633f" />
        <rect x="108" y="66" width="18" height="12" rx="3" fill="#c95f39" />
      </g>
      {/* 꺼내 놓은 물건들 — 밧줄, 물병, 지도 */}
      <circle cx="172" cy="93" r="7" fill="none" stroke="#b98a5a" strokeWidth="3.5" />
      <rect x="192" y="80" width="9" height="17" rx="3" fill="#6db3e8" />
      <g transform="rotate(-8 222 90)">
        <rect x="212" y="83" width="22" height="15" rx="2" fill="#fef7ec" stroke="#d9c9a5" />
        <path d="M215 90 q 4 -3 8 0 q 4 3 8 0" stroke="#9cb8d9" strokeWidth="1.4" fill="none" />
      </g>
      {/* "뭐가 부족하지?" 말풍선 */}
      <motion.g
        animate={reduce ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="166" cy="50" r="12" fill="#ffffff" opacity="0.95" />
        <path d="M157 58 L146 66 L161 62 Z" fill="#ffffff" opacity="0.95" />
        <text
          x="166"
          y="55"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fill="#0284c7"
        >
          ?
        </text>
      </motion.g>
    </g>
  );
}

/* ── 장면 5: 노을 — 갈림길에서 ────────────────────────── */

function SceneFork({ reduce }: { reduce: boolean }) {
  return (
    <g>
      {/* 낮게 걸린 노을 해 */}
      <circle cx="298" cy="70" r="24" fill="#ffb36b" opacity="0.4" />
      <circle cx="298" cy="70" r="14" fill="#ffb36b" />
      {/* 언덕 */}
      <path
        d="M-10 112 L-10 84 Q 90 66 180 78 Q 270 90 370 72 L370 112 Z"
        fill="#d9b97e"
      />
      {/* 두 갈래 길 */}
      <path
        d="M178 112 Q 168 94 140 84 Q 118 76 102 72"
        fill="none"
        stroke="#f7e6c0"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        d="M186 112 Q 194 92 224 82 Q 248 75 264 72"
        fill="none"
        stroke="#f7e6c0"
        strokeWidth="11"
        strokeLinecap="round"
      />
      {/* 갈림길 표지판 */}
      <g>
        <rect x="178" y="46" width="4" height="30" fill="#6b4a33" />
        <path d="M158 48 L182 48 L182 58 L158 58 L152 53 Z" fill="#b98a5a" />
        <path d="M178 62 L202 62 L208 67 L202 72 L178 72 Z" fill="#a3774b" />
      </g>
      {/* 바람에 흔들리는 나무들 */}
      <motion.g
        animate={reduce ? undefined : { rotate: [0, 2.6, 0, -2, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: 0.5, originY: 1 }}
      >
        <rect x="46" y="76" width="5" height="14" fill="#6b4a33" />
        <path d="M28 80 L48 44 L68 80 Z" fill="#4f7d5f" />
        <path d="M32 66 L48 38 L64 66 Z" fill="#5e9070" />
      </motion.g>
      <motion.g
        animate={reduce ? undefined : { rotate: [0, -2.2, 0, 1.6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        style={{ originX: 0.5, originY: 1 }}
      >
        <rect x="330" y="80" width="4" height="12" fill="#6b4a33" />
        <path d="M316 84 L332 54 L348 84 Z" fill="#4f7d5f" />
      </motion.g>
    </g>
  );
}

/* ── 장면 6: 해질녘 — 본부로 보내는 신호 ──────────────── */

function SceneSignal({ reduce }: { reduce: boolean }) {
  return (
    <g>
      {/* 달 */}
      <circle cx="294" cy="30" r="16" fill="#f5ead0" opacity="0.35" />
      <circle cx="294" cy="30" r="9" fill="#f5ead0" />
      <Sea fill="#35597e" reduce={reduce} />
      {/* 멀리 본부가 있는 섬 — 깜빡이는 불빛 */}
      <path d="M256 76 q 22 -18 48 -14 q 24 4 36 14 Z" fill="#26415c" />
      <motion.circle
        cx="296"
        cy="58"
        r="2.5"
        fill="#ffd98a"
        animate={reduce ? undefined : { opacity: [0.2, 1, 0.2] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* 해변 */}
      <path d="M-10 112 L-10 96 Q 70 86 150 96 L150 112 Z" fill="#d8b98a" />
      {/* 모닥불 신호 */}
      <g>
        <rect x="58" y="92" width="24" height="4.5" rx="2" fill="#5d4030" transform="rotate(14 70 94)" />
        <rect x="58" y="92" width="24" height="4.5" rx="2" fill="#6e4d3a" transform="rotate(-14 70 94)" />
      </g>
      <motion.g
        animate={reduce ? undefined : { scaleY: [1, 1.28, 0.9, 1], scaleX: [1, 1.08, 0.96, 1], opacity: [0.92, 1, 0.85, 0.92] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: 0.5, originY: 1 }}
      >
        <path d="M70 62 C 79 74, 81 84, 70 93 C 59 84, 61 74, 70 62 Z" fill="#ffab4a" />
        <path d="M70 74 C 75 80, 76 86, 70 91 C 64 86, 65 80, 70 74 Z" fill="#ffd98a" />
      </motion.g>
      {/* 퍼져나가는 신호 링 */}
      {!reduce &&
        [0, 0.8, 1.6].map((delay) => (
          <motion.circle
            key={delay}
            cx="70"
            cy="78"
            r="14"
            fill="none"
            stroke="#ffd98a"
            strokeWidth="1.6"
            initial={{ scale: 0.5, opacity: 0.7 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{ duration: 2.4, delay, repeat: Infinity, ease: "easeOut" }}
            style={{ originX: 0.5, originY: 0.5 }}
          />
        ))}
    </g>
  );
}
