import { Check } from "lucide-react";
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
      return <li key={booth.id} className="py-2.5">
        <h3 className="break-keep text-[15px] font-extrabold leading-snug text-hm-blue">
          {ZONE_MARK[zone] && <span aria-label={ZONE_LABELS[zone]} style={zone === "C" ? { backgroundColor: COMPETENCY_ZONE_COLOR } : undefined} className={cn("mr-1.5 inline-grid h-5 min-w-[22px] place-content-center rounded-md px-1.5 align-[2px] text-[11px] text-white", ZONE_BLOCK[zone])}>{ZONE_MARK[zone]}</span>}
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

export function BoothList({ booths, showZone = true, personaKeywords = [] }: { booths: ProfileBoothStatus[]; showZone?: boolean; personaKeywords?: string[] }) {
  const highlightedLabels = new Set(personaKeywords.map((keyword) => competencyLabel(keyword.trim().replace(/^#/, ""))));
  return <div className="flex flex-col gap-3">{booths.map((booth) => <article key={booth.id} className={`hm-card px-4 py-4 ${booth.visited ? "opacity-50" : ""}`}>
    {showZone && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
      <span style={booth.zone === "C" ? { backgroundColor: COMPETENCY_ZONE_COLOR } : undefined} className="rounded-full bg-hm-tint px-2.5 py-1 text-hm-blue">{booth.zone === "F" || booth.zone === "L" || booth.zone === "Y" ? ZONE_SHORT[booth.zone] : ZONE_LABELS[booth.zone ?? ""]}</span>
      {booth.visited && <span className="ml-auto flex items-center gap-1 text-hm-teal"><Check size={13} />참여 완료</span>}
    </div>}
    <div className="flex items-start justify-between gap-3">
      <h3 className="min-w-0 break-keep text-base font-extrabold text-hm-blue">{booth.name}</h3>
      {!showZone && booth.visited && <span className="flex shrink-0 items-center gap-1 pt-1 text-[11px] font-bold text-hm-teal"><Check size={13} />참여 완료</span>}
    </div>
    {booth.description && <p className="mt-1 text-xs leading-relaxed text-hm-blue/65">{booth.description}</p>}
    {!!booth.competencies?.length && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hm-pattern pt-2">{booth.competencies.map((key) => {
      const label = competencyLabel(key);
      const highlighted = highlightedLabels.has(label);
      return <span key={key} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]", highlighted ? "bg-hm-blue font-extrabold text-white" : "bg-hm-tint font-bold text-hm-blue/75")}>
        {highlighted && <span className="sr-only">페르소나와 일치하는 키워드: </span>}
        {label}
      </span>;
    })}</div>}
  </article>)}</div>;
}
