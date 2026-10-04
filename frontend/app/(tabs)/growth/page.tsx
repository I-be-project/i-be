"use client";

import Link from "next/link";
import { useState } from "react";
import { VisitSummary, VisitTimeline } from "@/components/tabs/BoothList";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { hasAnyScore, toChartData } from "@/lib/competencies";

export default function GrowthPage() {
  const [showCounts, setShowCounts] = useState(false);
  const { profile, readOnly, basePath, ...feedback } = useProfileView();
  const visited = (profile?.booths ?? []).filter((b) => b.visited).sort((a, b) => (b.visited_at ?? "").localeCompare(a.visited_at ?? ""));
  const scores = profile?.competencies;
  const chartData = toChartData(scores);
  const empty = !hasAnyScore(scores);
  return <TabPage logo={false} action={readOnly ? <MyPageLink /> : undefined}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
    <section className="hm-card px-2 pt-5 pb-3 sm:px-5">
      <p className="px-4 text-left text-xs font-extrabold tracking-wide text-hm-blue/60">{empty ? (readOnly ? "아직 참여한 부스의 역량 기록이 없어." : "첫 부스에 참여하고 QR을 찍어봐. 나의 역량 지도가 채워질 거야!") : "참여한 부스의 역량이 쌓인 기록이야"}</p>
      <div className="relative">
      <div className="h-[320px] w-full sm:h-[400px]" role="img" aria-label={empty ? "아직 참여 기록이 없는 역량 차트" : chartData.map((d) => `${d.label} ${d.score}점`).join(", ")}>
        <ResponsiveContainer width="100%" height="100%" className="pointer-events-none">
          <RadarChart accessibilityLayer={false} data={chartData} outerRadius="80%" margin={{ top: 20, right: 24, bottom: 20, left: 24 }}>
            <PolarGrid stroke="#c2e1f6" />
            <PolarAngleAxis dataKey="label" tick={({ x, y, textAnchor, payload }) => {
              const label = String(payload.value);
              const labelX = Number(x);
              const labelY = Number(y);
              const badgeX = labelX + (textAnchor === "start" ? 1 : textAnchor === "end" ? -1 : 0) * label.length * 5.5;
              const count = chartData.find((item) => item.label === label)?.score ?? 0;
              const badgeWidth = Math.max(24, String(count).length * 7 + 12);
              return <g>
                {showCounts && <g aria-hidden="true">
                  <rect x={badgeX - badgeWidth / 2} y={labelY - 29} width={badgeWidth} height={19} rx={9.5} fill="#eaf5fd" />
                  <text x={badgeX} y={labelY - 19.5} textAnchor="middle" dominantBaseline="central" fill="#005bab" fontSize={11} fontWeight={800}>{count}</text>
                </g>}
                <text x={labelX} y={labelY} textAnchor={textAnchor} dominantBaseline="central" fill="#005bab" fontSize={11} fontWeight={800}>{label}</text>
              </g>;
            }} />
            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
            <Radar dataKey="r" activeDot={false} stroke="#5fb0e5" strokeWidth={2} fill="#8fcdf0" fillOpacity={empty ? 0 : 0.45} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute right-2 bottom-2">
        <button type="button" aria-pressed={showCounts} onClick={() => setShowCounts((visible) => !visible)} className="rounded-full bg-hm-tint px-3 py-1.5 text-[11px] font-bold text-hm-blue hover:bg-hm-pattern focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hm-blue">
          {showCounts ? "개수 숨기기" : "개수 보기"}
        </button>
      </div>
      </div>
    </section>
      <section className="flex flex-col gap-4">
        <VisitSummary booths={visited} title={readOnly ? "참여 기록" : "나의 참여 기록"} />
        {visited.length ? <VisitTimeline booths={visited} /> : <div className="hm-card p-6 text-center text-sm text-hm-blue/70"><p>아직 참여한 부스가 없어.</p><Link href={`${basePath}/booths`} className="mt-3 inline-block font-extrabold text-hm-blue">첫 부스 찾아보기 →</Link></div>}
      </section>
    </>}
  </TabPage>;
}
