import {
  Code,
  GameController,
  MusicNotes,
  Palette,
  Plant,
  Rocket,
  SoccerBall,
  Stethoscope,
  Wrench,
} from "@phosphor-icons/react/ssr";

// 한마당 배경 — 하늘색 바탕 위에 진로 아이콘이 톤온톤으로 흩뿌려진다(포스터의 패턴 구성).
// 한쪽에 몰리지 않도록 화면을 3x3으로 나눠 한 칸에 하나씩, 크기·회전만 어긋나게 뒀다.
// 좌표·회전은 전부 고정값(하이드레이션 불일치 방지, Math.random 미사용).
// fixed라 페이지가 길어져도 패턴이 끊기지 않는다.
const ICONS = [
  { Icon: Stethoscope, x: 5, y: 4, size: 112, rotate: -12 },
  { Icon: SoccerBall, x: 44, y: 9, size: 96, rotate: 14 },
  { Icon: Code, x: 79, y: 3, size: 124, rotate: 8 },
  { Icon: Palette, x: 16, y: 33, size: 108, rotate: -14 },
  { Icon: MusicNotes, x: 52, y: 38, size: 100, rotate: -6 },
  { Icon: Rocket, x: 83, y: 30, size: 104, rotate: 10 },
  { Icon: Wrench, x: 3, y: 66, size: 116, rotate: 16 },
  { Icon: GameController, x: 40, y: 72, size: 120, rotate: 12 },
  { Icon: Plant, x: 80, y: 64, size: 98, rotate: -8 },
] as const;

export function HanmadangBackground() {
  return (
    <div
      aria-hidden
      className="bg-hanmadang pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {ICONS.map(({ Icon, x, y, size, rotate }, i) => (
        <span
          key={i}
          className="absolute text-hm-pattern"
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${rotate}deg)` }}
        >
          <Icon size={size} weight="fill" />
        </span>
      ))}
    </div>
  );
}

// 탭 4개 공용 카드 클래스 — 포스터 톤(불투명 흰 종이 + 또렷한 테두리).
// 각 페이지가 따로 선언하던 문자열을 여기로 모았다.
export const tabCardClass = "hm-card p-6";
