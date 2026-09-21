"use client";

import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { HanmadangBackground, tabCardClass } from "@/components/tabs/HanmadangBackground";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, type ProfileCompetencyScore } from "@/lib/api";
import { hasAnyScore, toChartData } from "@/lib/competencies";

export default function TendencyPage() {
  const studentToken = useSessionStore((s) => s.studentToken);

  const [scores, setScores] = useState<ProfileCompetencyScore[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentToken) return;
    let active = true;
    getMyProfile(studentToken)
      .then((profile) => {
        if (active) setScores(profile.competencies ?? []);
      })
      .catch((err) => {
        if (active) setScores(err instanceof ApiError ? [] : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentToken]);

  // 축은 항상 역량 10개로 고정이다. 부스가 몇 개로 늘어도 차트 모양이 무너지지 않는다.
  const chartData = toChartData(scores ?? undefined);
  const empty = !hasAnyScore(scores ?? undefined);

  return (
    <main className="relative flex min-h-[100dvh] flex-col px-5 pb-28 pt-8 font-sans">
      <HanmadangBackground />

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-hm-blue">자신의 성향</h1>
          <p className="mt-1.5 text-sm font-bold text-hm-blue/60">
            돌아본 부스에서 키운 역량을 그려봐.
          </p>
        </div>

        {loading ? (
          <div className={tabCardClass}>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : empty ? (
          <div className={`${tabCardClass} flex flex-col items-center gap-2 text-center`}>
            <p className="text-sm font-bold text-hm-blue">아직 데이터가 없어.</p>
            <p className="text-xs font-bold text-hm-blue/50">
              부스를 돌아보면 여기에 역량 그래프가 그려질 거야.
            </p>
          </div>
        ) : (
          <div className={`${tabCardClass} px-3 py-5`}>
            <div className="h-[26rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData} outerRadius="76%" margin={{ top: 12, right: 28, bottom: 12, left: 28 }}>
                  <PolarGrid stroke="#c2e1f6" />
                  <PolarAngleAxis
                    dataKey="label"
                    tick={{ fill: "#005bab", fontSize: 11.5, fontWeight: 800 }}
                  />
                  <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                  <Radar
                    dataKey="r"
                    stroke="#5fb0e5"
                    strokeWidth={2}
                    fill="#8fcdf0"
                    fillOpacity={0.45}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
