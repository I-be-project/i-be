import { Check } from "lucide-react";
import type { ProfileBoothStatus } from "@/lib/api";
import { competencyLabel, countVisitedByZone, ZONE_LABELS, ZONE_SHORT } from "@/lib/competencies";

export function VisitSummary({ booths }: { booths: ProfileBoothStatus[] }) {
  return <section className="hm-card p-5" aria-label="부스 참여 요약">
    <p className="font-bold text-hm-blue"><strong className="mr-2 text-3xl">{booths.length}</strong>개 부스 참여</p>
    <div className="mt-3 flex divide-x divide-hm-pattern border-t border-hm-pattern pt-3">
      {countVisitedByZone(booths).map(({ zone, count }) => <div key={zone} className="flex flex-1 flex-col items-center"><strong className={`text-xl ${zone === "L" ? "text-hm-coral" : zone === "Y" ? "text-hm-teal" : "text-hm-blue"}`}>{count}</strong><span className="text-[11px] font-bold text-hm-blue/60">{ZONE_SHORT[zone]}</span></div>)}
    </div>
  </section>;
}

export function BoothList({ booths, showDate = false }: { booths: ProfileBoothStatus[]; showDate?: boolean }) {
  return <div className="flex flex-col gap-3">{booths.map((booth) => <article key={booth.id} className="hm-card px-4 py-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
      <span className="rounded-full bg-hm-tint px-2.5 py-1 text-hm-blue">{ZONE_LABELS[booth.zone ?? ""]}</span>
      {showDate && booth.visited_at ? <time dateTime={booth.visited_at} className="text-hm-blue/55">{new Date(booth.visited_at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time> : booth.visited && <span className="flex items-center gap-1 text-hm-teal"><Check size={13} />참여 완료</span>}
    </div>
    <h3 className="break-keep text-base font-extrabold text-hm-blue">{booth.name}</h3>
    {booth.description && <p className="mt-1 text-xs leading-relaxed text-hm-blue/65">{booth.description}</p>}
    {!!booth.competencies?.length && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hm-pattern pt-2">{booth.competencies.map((key) => <span key={key} className="rounded-md bg-hm-tint px-2 py-1 text-[11px] font-bold text-hm-blue/75">{competencyLabel(key)}</span>)}</div>}
  </article>)}</div>;
}
