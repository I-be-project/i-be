"use client";

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { useConsole } from "@/components/console/ConsoleProvider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, fetchBoothStats, type BoothStats } from "@/lib/api";
import { ZONE_LABELS } from "@/lib/competencies";

/** 상단 요약 숫자 1칸. */
function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** 부스별 참여인원 — 관리자·운영진 공통 화면. */
export function BoothStatsView() {
  const router = useRouter();
  const { getToken, clearToken, loginPath } = useConsole();
  const [stats, setStats] = useState<BoothStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace(loginPath);
      return;
    }
    setLoading(true);
    try {
      setStats(await fetchBoothStats(token));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace(loginPath);
        return;
      }
      setError(
        err instanceof ApiError ? err.message : "참여인원을 불러오지 못했어요."
      );
    } finally {
      setLoading(false);
    }
  }, [router, getToken, clearToken, loginPath]);

  useEffect(() => {
    void load();
  }, [load]);

  // 가장 많이 찍힌 부스를 기준으로 막대 길이를 잡는다(0으로 나누지 않도록 최소 1).
  // 존마다 기준이 달라지면 막대 길이를 존 사이에서 비교할 수 없어, 그룹으로 나눈 뒤에도
  // 이 전체 기준값을 그대로 쓴다.
  const max = Math.max(1, ...(stats?.booths.map((b) => b.visit_count) ?? [1]));

  // 존별로 묶어 보여준다. 집계 자체는 서버가 하고, 화면은 나누기만 한다.
  const groups = (["F", "L", "Y", "C", ""] as const)
    .map((zone) => ({
      zone,
      rows: (stats?.booths ?? []).filter((b) => b.zone === zone),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight">부스별 참여인원</h1>
          <p className="text-sm text-muted-foreground">
            학생이 부스 QR을 찍은 기록을 부스별로 집계했어요.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !stats || stats.booths.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-muted-foreground">
            <Inbox className="size-8" aria-hidden />
            <p className="text-sm">아직 등록한 부스가 없어요.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
              <StatTile
                label="연인원"
                value={stats.total_visits}
                hint="부스 방문 기록 총합"
              />
              <StatTile
                label="실인원"
                value={stats.unique_students}
                hint="한 곳이라도 찍은 학생"
              />
            </div>

            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.zone || "none"}>
                  <h2 className="mb-2 text-sm font-semibold text-ink">
                    {ZONE_LABELS[group.zone]}
                  </h2>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>부스</TableHead>
                          <TableHead>코드</TableHead>
                          <TableHead className="w-[45%]">참여</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((b) => (
                          <TableRow key={b.booth_id}>
                            <TableCell className="font-medium">{b.name}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {b.code}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                                  role="presentation"
                                >
                                  <div
                                    className="h-full rounded-full bg-[var(--chart-2)]"
                                    style={{
                                      width: `${(b.visit_count / max) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-14 shrink-0 text-right tabular-nums">
                                  {b.visit_count}명
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
