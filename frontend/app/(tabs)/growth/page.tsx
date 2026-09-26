"use client";

import Link from "next/link";
import { Camera, ArrowUpRight } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { TabPage, ProfileFeedback } from "@/components/tabs/TabPage";
import { useProfileView, MyPageLink } from "@/components/tabs/ProfileView";
import { hasAnyScore, toChartData } from "@/lib/competencies";

export default function GrowthPage() {
  const { profile, readOnly, ...feedback } = useProfileView();
  const scores = profile?.competencies;
  const chartData = toChartData(scores);
  const empty = !hasAnyScore(scores);
  return <TabPage title={readOnly ? "함께 보는 성장" : "나의 성장"} description={readOnly ? `${profile?.persona?.name ?? "탐험대원"}의 참여 기록 · 보기 전용` : undefined} action={readOnly ? <MyPageLink /> : undefined}>
    <ProfileFeedback {...feedback} />
    {!feedback.loading && !feedback.error && profile && <section className="hm-card px-2 py-5 sm:px-5">
      <div className="px-3"><p className="text-xs font-bold text-hm-teal">{readOnly ? "체험으로 쌓은 가능성" : "체험으로 발견한 나"}</p><h2 className="mt-1 text-xl font-extrabold text-hm-blue">{readOnly ? "역량 지도" : "나의 역량 지도"}</h2></div>
      <div className="h-[320px] w-full sm:h-[400px]" role="img" aria-label={empty ? "아직 참여 기록이 없는 역량 차트" : chartData.map((d) => `${d.label} ${d.score}점`).join(", ")}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="80%" margin={{ top: 20, right: 24, bottom: 20, left: 24 }}>
            <PolarGrid stroke="#c2e1f6" /><PolarAngleAxis dataKey="label" tick={{ fill: "#005bab", fontSize: 11, fontWeight: 800 }} /><PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
            <Radar dataKey="r" stroke="#5fb0e5" strokeWidth={2} fill="#8fcdf0" fillOpacity={empty ? 0 : 0.45} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="px-4 text-center text-xs leading-relaxed text-hm-blue/65">{empty ? (readOnly ? "아직 참여한 부스의 역량 기록이 없어." : "첫 부스에 참여하고 QR을 찍어봐. 나의 역량 지도가 채워질 거야!") : "참여한 부스의 역량이 쌓인 기록이야. 다양한 체험으로 지도를 넓혀봐."}</p>
    </section>}
    {!readOnly && <Link href="/growth/scan" className="hm-card group flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-hm-blue transition-colors hover:bg-hm-tint focus-visible:outline-2 focus-visible:outline-hm-blue">
      <Camera size={42} strokeWidth={1.7} /><span className="flex items-center gap-2 text-lg font-extrabold">QR 스캔<ArrowUpRight size={18} /></span><span className="text-xs text-hm-blue/65">부스의 QR을 찍고 참여 기록을 남겨봐</span>
    </Link>}
  </TabPage>;
}
