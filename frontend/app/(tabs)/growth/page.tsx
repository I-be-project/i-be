"use client";

import Link from "next/link";
import { SOFT_CARD, StampSummary, VisitJournal } from "@/components/tabs/BoothList";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { hasAnyScore, toChartData } from "@/lib/competencies";

// 레이더 색 — 격자는 아주 연하게, 데이터는 반투명 면 + 얇은 선.
const GRID = "#e9eff5";
const SHAPE = "#2a8fd4";
// 축 이름·점수를 차트 바깥으로 밀어내는 거리(px). 가운데 정렬이라 좌우 축이 차트에 붙지 않게 한다.
const LABEL_PUSH = 16;

export default function GrowthPage() {
  const { profile, readOnly, basePath, ...feedback } = useProfileView();
  const visited = (profile?.booths ?? []).filter((b) => b.visited).sort((a, b) => (b.visited_at ?? "").localeCompare(a.visited_at ?? ""));
  const scores = profile?.competencies;
  const chartData = toChartData(scores);
  const empty = !hasAnyScore(scores);
  return <TabPage action={readOnly ? <MyPageLink /> : undefined}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <>
      <StampSummary booths={visited} />
      <section className={`${SOFT_CARD} px-4 pt-[18px] pb-3`}>
        <h2 className="text-[1.3rem] font-extrabold text-hm-blue">나의 역량 지도</h2>
        {empty && <p className="mt-1 text-xs font-bold text-hm-blue/60">{readOnly ? "아직 참여한 부스의 역량 기록이 없어." : "첫 부스에 참여하고 QR을 찍어봐. 나의 역량 지도가 채워질 거야!"}</p>}
        <div className="h-[300px] w-full sm:h-[380px]" role="img" aria-label={empty ? "아직 참여 기록이 없는 역량 차트" : chartData.map((d) => `${d.label} ${d.score}점`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%" className="pointer-events-none">
            <RadarChart accessibilityLayer={false} data={chartData} outerRadius="66%" margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
              <PolarGrid stroke={GRID} strokeWidth={0.8} />
              <PolarAngleAxis dataKey="label" tick={({ x, y, payload }) => {
                const label = String(payload.value);
                const score = chartData.find((item) => item.label === label)?.score ?? 0;
                // payload.coordinate는 축 각도(도, 반시계). recharts polarToCartesian과 같은 식으로 바깥 방향을 구한다.
                const rad = (-Number(payload.coordinate) * Math.PI) / 180;
                const tx = Number(x) + Math.cos(rad) * LABEL_PUSH, ty = Number(y) + Math.sin(rad) * LABEL_PUSH;
                const on = score > 0;
                return <g>
                  <text x={tx} y={ty - 5} textAnchor="middle" dominantBaseline="central" fill={on ? "#4d7fae" : "#9dbbd6"} fontSize={11} fontWeight={400}>{label}</text>
                  <text x={tx} y={ty + 7} textAnchor="middle" dominantBaseline="central" fill="#9dbbd6" fontSize={10} fontWeight={400}>{score}</text>
                </g>;
              }} />
              <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
              <Radar dataKey="r" activeDot={false} stroke={SHAPE} strokeWidth={1} fill={SHAPE} fillOpacity={empty ? 0 : 0.28} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>
      {visited.length ? <VisitJournal booths={visited} /> : <div className={`${SOFT_CARD} p-6 text-center text-sm text-hm-blue/70`}><p>아직 참여한 부스가 없어.</p><Link href={`${basePath}/booths`} className="mt-3 inline-block font-extrabold text-hm-blue">첫 부스 찾아보기 →</Link></div>}
    </>}
  </TabPage>;
}
