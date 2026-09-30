import { Check } from "lucide-react";
import type { ProfileBoothStatus } from "@/lib/api";
import { competencyLabel, countVisitedByZone, ZONE_LABELS, ZONE_SHORT } from "@/lib/competencies";

export function VisitSummary({ booths }: { booths: ProfileBoothStatus[] }) {
  return <section className="hm-card p-5" aria-label="부스 참여 요약">
    <p className="py-4 font-bold text-hm-blue"><strong className="mr-2 text-5xl">{booths.length}</strong>개 부스 참여</p>
    <div className="mt-3 flex divide-x divide-hm-pattern border-t border-hm-pattern pt-3">
      {countVisitedByZone(booths).map(({ zone, count }) => <div key={zone} className="flex flex-1 flex-col items-center"><strong className={`text-xl ${zone === "L" ? "text-hm-coral" : zone === "Y" ? "text-hm-teal" : "text-hm-blue"}`}>{count}</strong><span className="text-[11px] font-bold text-hm-blue/60">{ZONE_SHORT[zone]}</span></div>)}
    </div>
  </section>;
}

const ZONE_DOT: Record<string, string> = { F: "bg-hm-blue", L: "bg-hm-coral", Y: "bg-hm-teal", C: "bg-[#8cc63f]", "": "bg-hm-pattern" };

// 참여 기록 — 위 요약 카드와 구분되게 박스 없이, 존 색 배지 + 2줄 행으로 그린다.
export function VisitTimeline({ booths }: { booths: ProfileBoothStatus[] }) {
  // 배지 칸을 행 높이만큼 늘려 위·아래 반쪽 선을 그리면, 행 높이가 달라도 배지끼리 선이 이어진다.
  return <ol>{booths.map((booth, i) => <li key={booth.id} className="flex items-center gap-3">
    <span className="flex w-7 shrink-0 flex-col items-center self-stretch" aria-label={ZONE_LABELS[booth.zone ?? ""]}>
      <span className={`w-0.5 flex-1 ${i > 0 ? "bg-hm-pattern" : ""}`} />
      <span className={`flex items-center justify-center text-xs font-extrabold text-white ${booth.zone === "C" ? "my-1 size-5 rotate-45" : "size-7 rounded-full"} ${ZONE_DOT[booth.zone ?? ""]}`}>{booth.zone !== "C" && booth.zone}</span>
      <span className={`w-0.5 flex-1 ${i < booths.length - 1 ? "bg-hm-pattern" : ""}`} />
    </span>
    <div className="min-w-0 flex-1 py-2.5">
      <h3 className="break-keep font-extrabold leading-snug text-hm-blue">{booth.name}</h3>
      {!!booth.competencies?.length && <p className="mt-0.5 text-xs text-hm-blue/60">{booth.competencies.map(competencyLabel).join(" · ")}</p>}
    </div>
    {booth.visited_at && <time dateTime={booth.visited_at} className="shrink-0 text-right text-[11px] font-bold leading-tight text-hm-blue/50">{new Date(booth.visited_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}<br />{new Date(booth.visited_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time>}
  </li>)}</ol>;
}

export function BoothList({ booths }: { booths: ProfileBoothStatus[] }) {
  return <div className="flex flex-col gap-3">{booths.map((booth) => <article key={booth.id} className={`hm-card px-4 py-4 ${booth.visited ? "opacity-50" : ""}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
      <span className="rounded-full bg-hm-tint px-2.5 py-1 text-hm-blue">{ZONE_LABELS[booth.zone ?? ""]}</span>
      {booth.visited && <span className="flex items-center gap-1 text-hm-teal"><Check size={13} />참여 완료</span>}
    </div>
    <h3 className="break-keep text-base font-extrabold text-hm-blue">{booth.name}</h3>
    {booth.description && <p className="mt-1 text-xs leading-relaxed text-hm-blue/65">{booth.description}</p>}
    {!!booth.competencies?.length && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hm-pattern pt-2">{booth.competencies.map((key) => <span key={key} className="rounded-md bg-hm-tint px-2 py-1 text-[11px] font-bold text-hm-blue/75">{competencyLabel(key)}</span>)}</div>}
  </article>)}</div>;
}
