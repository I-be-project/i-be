"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, type ProfileCompetencyScore } from "@/lib/api";
import { hasAnyScore, toChartData } from "@/lib/competencies";

const cardClass =
  "rounded-3xl border border-solid border-white/70 bg-white/85 p-6 shadow-[0_12px_32px_rgba(37,99,235,0.10)] backdrop-blur-xl";

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
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden px-5 pb-28 pt-8 font-sans">
      <VoyageBackground variant="soft" />

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">자신의 성향</h1>
          <p className="mt-1.5 text-sm font-medium text-ink-muted">
            돌아본 부스에서 키운 역량을 그려봐.
          </p>
        </div>

        {loading ? (
          <div className={cardClass}>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : empty ? (
          <div className={`${cardClass} flex flex-col items-center gap-2 text-center`}>
            <Sparkles className="h-8 w-8 text-sky-300" />
            <p className="text-sm font-bold text-ink-muted">아직 데이터가 없어.</p>
            <p className="text-xs font-medium text-ink-muted/70">
              부스를 돌아보면 여기에 역량 그래프가 그려질 거야.
            </p>
          </div>
        ) : (
          <div className={cardClass}>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData} outerRadius="68%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="#cfe3f5" />
                  <PolarAngleAxis
                    dataKey="label"
                    tick={{ fill: "#4c6a82", fontSize: 10, fontWeight: 700 }}
                  />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar
                    dataKey="score"
                    stroke="#0284c7"
                    fill="#38bdf8"
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
