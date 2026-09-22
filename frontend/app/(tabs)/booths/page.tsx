"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { HanmadangBackground, tabCardClass } from "@/components/tabs/HanmadangBackground";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, type ProfileBoothStatus } from "@/lib/api";
import {
  competencyLabel,
  countVisitedByZone,
  ZONE_LABELS,
  ZONE_SHORT,
  type BoothZone,
} from "@/lib/competencies";

// 부스 한 장짜리 카드. tabCardClass의 p-6을 덮어쓰는 대신 따로 둔다 — 같은 속성을 겹쳐
// 쓰면 어느 쪽이 이기는지가 Tailwind의 클래스 생성 순서에 달려 있어 읽는 사람이 헷갈린다.
const rowClass = "hm-card flex flex-col gap-2 px-4 py-3.5";

// 존별 색. 부스 이름만으로는 어느 존인지 알 수 없어 뱃지 색으로 한눈에 구분한다.
// 포스터 팔레트가 3색이라 네 번째 존(C)은 파랑의 진한 변주로 채웠다.
const zoneBadgeClass: Record<BoothZone, string> = {
  F: "border-hm-blue/25 bg-hm-blue/10 text-hm-blue",
  L: "border-hm-coral/30 bg-hm-coral/10 text-hm-coral",
  Y: "border-hm-teal/30 bg-hm-teal/10 text-hm-teal",
  C: "border-hm-blue/40 bg-hm-blue/85 text-white",
  "": "border-hm-pattern bg-hm-tint text-hm-blue/60",
};

// 요약 그리드의 숫자 색. zoneBadgeClass는 배경·테두리까지 묶여 있어 여기선 못 쓴다.
const zoneNumberClass: Record<BoothZone, string> = {
  F: "text-hm-blue",
  L: "text-hm-coral",
  Y: "text-hm-teal",
  C: "text-hm-blue/70",
  "": "text-hm-blue/40",
};

/** "9월 13일 14:22". 서버가 UTC ISO로 주므로 브라우저 타임존으로 표시된다. */
function formatVisitedAt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BoothsPage() {
  const studentToken = useSessionStore((s) => s.studentToken);

  const [booths, setBooths] = useState<ProfileBoothStatus[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentToken) return;
    let active = true;
    getMyProfile(studentToken)
      .then((profile) => {
        if (active) setBooths(profile.booths ?? []);
      })
      .catch((err) => {
        if (active) setBooths(err instanceof ApiError ? [] : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentToken]);

  const visited = (booths ?? []).filter((b) => b.visited);
  const zoneCounts = countVisitedByZone(visited);

  return (
    <main className="relative flex min-h-[100dvh] flex-col px-5 pb-28 pt-8 font-sans">
      <HanmadangBackground />

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-hm-blue">참여한 부스</h1>
          <p className="mt-1.5 text-sm font-bold text-hm-blue/60">
            QR을 찍으면 여기에 기록이 쌓여.
          </p>
        </div>

        {loading ? (
          <div className={tabCardClass}>
            <Skeleton className="mb-3 h-6 w-32" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : visited.length === 0 ? (
          <div className={`${tabCardClass} flex flex-col items-center gap-2 text-center`}>
            <MapPin className="h-8 w-8 text-hm-coral" />
            <p className="text-sm font-bold text-hm-blue">
              아직 참여한 부스가 없어. 부스에서 QR을 찍어봐!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <section className="hm-card flex flex-col gap-3 p-5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold leading-none text-hm-blue">
                  {visited.length}
                </span>
                <span className="text-sm font-extrabold text-hm-blue/70">개 부스 참여</span>
              </div>

              {/* 존별 참여 수 — 한 행에 나란히. 안 가본 존도 0으로 남겨 어디가 비었는지 보이게 한다. */}
              <div className="flex divide-x divide-hm-pattern border-t border-solid border-hm-pattern pt-3">
                {zoneCounts.map(({ zone, count }) => (
                  <div key={zone} className="flex flex-1 flex-col items-center gap-0.5">
                    <span
                      className={`text-xl font-extrabold leading-none ${
                        count === 0 ? "text-hm-blue/25" : zoneNumberClass[zone]
                      }`}
                    >
                      {count}
                    </span>
                    <span className="text-[10px] font-bold text-hm-blue/50">
                      {ZONE_SHORT[zone]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            {visited.map((booth) => {
              const zone = booth.zone ?? "";
              return (
                <div key={booth.id} className={rowClass}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border border-solid px-2.5 py-0.5 text-[11px] font-extrabold ${zoneBadgeClass[zone]}`}
                    >
                      {ZONE_LABELS[zone]}
                    </span>
                    {booth.visited_at ? (
                      <span className="shrink-0 text-[11px] font-bold text-hm-blue/45">
                        {formatVisitedAt(booth.visited_at)}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <p className="break-keep text-[15px] font-extrabold leading-snug text-hm-blue">
                      {booth.name}
                    </p>
                    {booth.description ? (
                      <p className="mt-0.5 break-keep text-xs font-medium text-hm-blue/60">
                        {booth.description}
                      </p>
                    ) : null}
                  </div>

                  {booth.competencies && booth.competencies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 border-t border-solid border-hm-pattern pt-2">
                      {booth.competencies.map((key) => (
                        <span
                          key={key}
                          className="rounded-md bg-hm-tint px-2 py-0.5 text-[11px] font-bold text-hm-blue/75"
                        >
                          {competencyLabel(key)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
