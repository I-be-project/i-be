import type { ProfileBoothStatus } from "@/lib/api";
import { competencyLabel, countVisitedByZone, ZONE_LABELS, ZONE_SHORT, type BoothZone } from "@/lib/competencies";
import { groupVisitsByDay } from "@/lib/visitDays";
import { cn } from "@/lib/utils";
import { COMPETENCY_ZONE_COLOR, COMPETENCY_ZONE_INK } from "@/lib/zoneColors";

// 성장 탭 공통 카드 — 테두리 대신 옅은 그림자로 바탕에서 띄운다.
export const SOFT_CARD = "rounded-[22px] bg-white shadow-[0_8px_20px_-10px_rgba(0,91,171,0.32),0_1px_3px_rgba(0,91,171,0.08)]";

const ZONE_TEXT: Record<BoothZone, string> = { F: "text-hm-blue", L: "text-hm-coral", Y: "text-hm-teal", C: "", "": "text-hm-blue/50" };
const ZONE_BORDER: Record<BoothZone, string> = { F: "border-hm-blue", L: "border-hm-coral", Y: "border-hm-teal", C: "", "": "border-hm-blue/40" };
const STAMP_TILT = ["-rotate-[8deg]", "rotate-[5deg]", "-rotate-[3deg]", "rotate-[7deg]", "-rotate-[5deg]"];
// 기록 앞에 붙는 존 표시. 역량체험존은 C 대신 "역량".
const ZONE_MARK: Record<BoothZone, string> = { F: "F", L: "L", Y: "Y", C: "역량", "": "" };
// 존 표시 블록 바탕. 역량체험존(옐로)은 COMPETENCY_ZONE_COLOR를 style로 칠한다.
const ZONE_BLOCK: Record<BoothZone, string> = { F: "bg-hm-blue", L: "bg-hm-coral", Y: "bg-hm-teal", C: "", "": "" };
const zoneInk = (zone: BoothZone) => (zone === "C" ? { color: COMPETENCY_ZONE_INK } : undefined);

// 존 색 네모 안에 흰 글씨(F·L·Y·역량). 존을 모르면 그리지 않는다.
export function ZoneBlock({ zone, className }: { zone: BoothZone; className?: string }) {
  if (!ZONE_MARK[zone]) return null;
  return <span aria-label={ZONE_LABELS[zone]} style={zone === "C" ? { backgroundColor: COMPETENCY_ZONE_COLOR, color: COMPETENCY_ZONE_INK } : undefined} className={cn("inline-grid h-5 min-w-[22px] place-content-center rounded-md px-1.5 text-[11px] font-extrabold text-white", ZONE_BLOCK[zone], className)}>{ZONE_MARK[zone]}</span>;
}

// 참여 요약 — 큰 숫자 + 존별 도장. 0인 존도 흐린 도장으로 남겨 안 가본 존이 보이게 한다.
export function StampSummary({ booths }: { booths: ProfileBoothStatus[] }) {
  return <section className={`${SOFT_CARD} px-[18px] py-5`} aria-label="부스 참여 요약">
    {/* 숫자·도장 묶음을 휴대폰 폭으로 고정하고 카드 가운데에 둔다. */}
    <div className="mx-auto max-w-[336px]">
    <p className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-1.5 font-extrabold text-hm-blue">
      <strong className="text-[4.4rem] font-extrabold leading-[0.85]">{booths.length}</strong>
      <span className="pb-1 text-[1.3rem] leading-tight">개 부스 참여</span>
    </p>
    <div className="mt-4 grid grid-cols-4 gap-2">
      {countVisitedByZone(booths).map(({ zone, count }, i) => <div key={zone} style={zone === "C" ? { ...zoneInk(zone), borderColor: COMPETENCY_ZONE_COLOR } : undefined} className={cn("grid aspect-square place-content-center rounded-full border-[2.5px] border-dashed text-center", ZONE_TEXT[zone], ZONE_BORDER[zone], STAMP_TILT[i % STAMP_TILT.length], count === 0 && "opacity-40")}>
        <strong className="text-[1.6rem] font-extrabold leading-none">{count}</strong>
        <span className="mt-0.5 text-[11px] font-bold">{ZONE_SHORT[zone]}</span>
      </div>)}
    </div>
    </div>
  </section>;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

// 체험 일지 — 날짜를 크게 쓰고 그날 참여한 부스를 글로만 쌓는다.
export function VisitJournal({ booths }: { booths: ProfileBoothStatus[] }) {
  return <div className="flex flex-col gap-[22px] px-1">{groupVisitsByDay(booths).map((day) => <section key={day.key} className="grid grid-cols-[58px_minmax(0,1fr)] gap-3.5" aria-label={`${day.month}월 ${day.day}일 참여 기록`}>
    <div className="text-center text-hm-blue">
      <strong className="block text-[2.4rem] font-extrabold leading-none">{day.day}</strong>
      <span className="text-xs font-bold text-hm-blue/70">{day.month}월 · {day.weekday}</span>
    </div>
    <ul className="border-t-2 border-hm-blue">{day.visits.map((booth) => {
      const zone = booth.zone ?? "";
      return <li key={booth.id} className={cn("py-2.5", ZONE_MARK[zone] && "grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5")}>
        <ZoneBlock zone={zone} className="row-span-2 self-start" />
        <h3 className="break-keep text-[15px] font-extrabold leading-snug text-hm-blue">
          {booth.name}
        </h3>
        <div className="mt-0.5 flex items-baseline justify-between gap-2.5 text-xs">
          <p className="min-w-0 text-hm-blue/70">{booth.competencies?.map(competencyLabel).join(", ")}</p>
          {booth.visited_at && <time dateTime={booth.visited_at} className="shrink-0 text-hm-blue/45">{timeOf(booth.visited_at)}</time>}
        </div>
      </li>;
    })}</ul>
  </section>)}</div>;
}

// 부스 탭 — 고른 존 하나의 부스 목록. 머리에 그 존의 참여 진행(참여 수 / 전체)을 막대로 보여준다.
export function ZoneSection({ zone, booths, personaKeywords = [], onSelect }: { zone: BoothZone; booths: ProfileBoothStatus[]; personaKeywords?: string[]; onSelect?: (booth: ProfileBoothStatus) => void }) {
  const visited = booths.filter((b) => b.visited).length;
  return <section className={`${SOFT_CARD} p-4`} aria-label={`${ZONE_SHORT[zone]} 부스`}>
    <header className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
      <span style={zoneInk(zone)} className={cn("font-extrabold leading-none", zone === "C" ? "text-xl" : "text-[1.9rem]", ZONE_TEXT[zone])}>{ZONE_MARK[zone]}</span>
      <div>
        <h2 className="text-[18px] font-extrabold leading-snug text-hm-blue">{ZONE_SHORT[zone]} 부스</h2>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e9eff5]">
          <div style={{ width: `${booths.length ? (visited / booths.length) * 100 : 0}%`, ...(zone === "C" ? { backgroundColor: COMPETENCY_ZONE_COLOR } : {}) }} className={cn("h-full rounded-full", ZONE_BLOCK[zone])} />
        </div>
      </div>
      <span className="text-xs font-extrabold text-hm-blue/70">{visited} / {booths.length}</span>
    </header>
    <BoothRows booths={booths} personaKeywords={personaKeywords} onSelect={onSelect} />
  </section>;
}

// 추천 탭 — 페르소나 역량·분야와 맞는 부스. 여러 존이 섞이므로 행마다 존 블록을 붙인다.
export function RecommendSection({ booths, personaKeywords = [], onSelect }: { booths: ProfileBoothStatus[]; personaKeywords?: string[]; onSelect?: (booth: ProfileBoothStatus) => void }) {
  return <section className={`${SOFT_CARD} p-4`} aria-label="추천 부스">
    <header className="mb-1.5">
      <h2 className="text-[20px] font-extrabold leading-snug text-hm-blue">지금 가 볼 만한 부스</h2>
    </header>
    <BoothRows booths={booths} personaKeywords={personaKeywords} onSelect={onSelect} showZone empty="아직 추천할 부스가 없어. 존을 골라 둘러봐." />
  </section>;
}

function BoothRows({ booths, personaKeywords = [], showZone = false, empty = "조건에 맞는 부스가 없어.", onSelect }: { booths: ProfileBoothStatus[]; personaKeywords?: string[]; showZone?: boolean; empty?: string; onSelect?: (booth: ProfileBoothStatus) => void }) {
  const mine = new Set(personaKeywords.map((keyword) => competencyLabel(keyword.trim().replace(/^#/, ""))));
  if (!booths.length) return <p className="border-t border-[#e9eff5] py-6 text-center text-sm text-hm-blue/60">{empty}</p>;
  return <ul>{booths.map((booth) => {
    const zone = booth.zone ?? "";
    return <li key={booth.id} className="border-t border-[#e9eff5]">
      <button type="button" onClick={() => onSelect?.(booth)} className="flex w-full justify-between gap-2.5 py-2.5 text-left">
      <div className="min-w-0">
        <h3 className={cn("break-keep text-[15px] font-extrabold leading-snug", booth.visited ? "text-hm-blue/40" : "text-hm-blue")}>
          {showZone && <ZoneBlock zone={zone} className="mr-1.5 align-[2px]" />}
          {booth.name}
        </h3>
        {!!booth.competencies?.length && <p className="mt-0.5 text-xs text-hm-blue/45">{booth.competencies.map((key, i) => {
          const label = competencyLabel(key);
          return <span key={key}>{i > 0 && ", "}{mine.has(label) ? <strong className="font-extrabold text-hm-blue">{label}</strong> : label}</span>;
        })}</p>}
      </div>
      {booth.visited && <span className="shrink-0 text-[11px] font-extrabold text-hm-teal">참여 완료</span>}
      </button>
    </li>;
  })}</ul>;
}
