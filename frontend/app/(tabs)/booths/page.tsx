"use client";

import { useEffect, useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, type ProfileBoothStatus } from "@/lib/api";

const cardClass =
  "rounded-3xl border border-solid border-white/70 bg-white/85 p-6 shadow-[0_12px_32px_rgba(37,99,235,0.10)] backdrop-blur-xl";

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
          <div className={cardClass}>
            <div className="mb-4 flex items-center gap-1.5 text-sm font-bold text-sky-700">
              <Sparkles className="h-4 w-4" />
              {visited.length}개 부스 참여
            </div>
            <div className="flex flex-wrap gap-2">
              {visited.map((booth) => (
                <span
                  key={booth.id}
                  className="rounded-full border border-solid border-sky-200 bg-sky-50 px-3.5 py-1.5 text-sm font-bold text-sky-700"
                >
                  {booth.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
