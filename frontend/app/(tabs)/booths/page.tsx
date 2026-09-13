"use client";

import { useEffect, useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, type ProfileBoothStatus } from "@/lib/api";
import { competencyLabel, ZONE_LABELS, type BoothZone } from "@/lib/competencies";

const cardClass =
  "rounded-3xl border border-solid border-white/70 bg-white/85 p-6 shadow-[0_12px_32px_rgba(37,99,235,0.10)] backdrop-blur-xl";

// 부스 한 장짜리 카드. cardClass의 p-6을 덮어쓰는 대신 따로 둔다 — 같은 속성을 겹쳐
// 쓰면 어느 쪽이 이기는지가 Tailwind의 클래스 생성 순서에 달려 있어 읽는 사람이 헷갈린다.
const rowClass =
  "flex flex-col gap-2 rounded-2xl border border-solid border-white/70 bg-white/85 px-4 py-3.5 shadow-[0_6px_18px_rgba(37,99,235,0.08)] backdrop-blur-xl";

// 존별 색. 부스 이름만으로는 어느 존인지 알 수 없어 뱃지 색으로 한눈에 구분한다.
const zoneBadgeClass: Record<BoothZone, string> = {
  F: "border-sky-200 bg-sky-50 text-sky-700",
  L: "border-rose-200 bg-rose-50 text-rose-700",
  Y: "border-amber-200 bg-amber-50 text-amber-700",
  C: "border-violet-200 bg-violet-50 text-violet-700",
  "": "border-slate-200 bg-slate-50 text-slate-600",
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

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden px-5 pb-28 pt-8 font-sans">
      <VoyageBackground variant="soft" />

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">참여한 부스</h1>
          <p className="mt-1.5 text-sm font-medium text-ink-muted">
            QR을 찍으면 여기에 기록이 쌓여.
          </p>
        </div>

        {loading ? (
          <div className={cardClass}>
            <Skeleton className="mb-3 h-6 w-32" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : visited.length === 0 ? (
          <div className={`${cardClass} flex flex-col items-center gap-2 text-center`}>
            <MapPin className="h-8 w-8 text-sky-300" />
            <p className="text-sm font-bold text-ink-muted">
              아직 참여한 부스가 없어. 부스에서 QR을 찍어봐!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 px-1 text-sm font-bold text-sky-700">
              <Sparkles className="h-4 w-4" />
              {visited.length}개 부스 참여
            </div>
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
                      <span className="shrink-0 text-[11px] font-semibold text-ink-muted/70">
                        {formatVisitedAt(booth.visited_at)}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <p className="break-keep text-[15px] font-bold leading-snug text-ink">
                      {booth.name}
                    </p>
                    {booth.description ? (
                      <p className="mt-0.5 break-keep text-xs font-medium text-ink-muted">
                        {booth.description}
                      </p>
                    ) : null}
                  </div>

                  {booth.competencies && booth.competencies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 border-t border-solid border-sky-100/80 pt-2">
                      {booth.competencies.map((key) => (
                        <span
                          key={key}
                          className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700"
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
