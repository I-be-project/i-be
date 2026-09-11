"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BoothPrintSheet } from "@/components/admin/BoothPrintSheet";
import { useConsole } from "@/components/console/ConsoleProvider";
import { Button } from "@/components/ui/button";
import { ZONE_LABELS, type BoothZone } from "@/lib/competencies";
import { ApiError, fetchAdminBooths, type AdminBooth } from "@/lib/api";

/**
 * 부스 QR 일괄 인쇄. 존을 고르고 브라우저 인쇄를 쓴다.
 *
 * PDF 생성기를 넣지 않는다. 인쇄는 브라우저가 이미 할 줄 알고, 결과물을 미리보기로
 * 확인한 뒤 뽑을 수 있어야 한다.
 */
export default function BoothPrintPage() {
  const router = useRouter();
  const { getToken, clearToken, loginPath } = useConsole();
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [zone, setZone] = useState<BoothZone | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace(loginPath);
      return;
    }
    setError(null);
    try {
      setBooths(await fetchAdminBooths(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace(loginPath);
        return;
      }
      // 빈 목록과 구분해야 한다 — 그냥 삼키면 서버 오류를 "인쇄할 부스가 없다"로 오해한다.
      setError("부스를 불러오지 못했어요. 새로고침해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [clearToken, getToken, loginPath, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = zone === "all" ? booths : booths.filter((b) => b.zone === zone);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="mr-auto text-xl font-extrabold">부스 QR 일괄 인쇄</h1>
        {(["all", "F", "L", "Y", "C"] as const).map((z) => (
          <Button
            key={z}
            variant={zone === z ? "default" : "outline"}
            size="sm"
            onClick={() => setZone(z)}
          >
            {z === "all" ? "전체" : ZONE_LABELS[z]}
          </Button>
        ))}
        <Button
          size="sm"
          onClick={() => window.print()}
          disabled={!!error || visible.length === 0}
        >
          인쇄
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">부스를 불러오는 중…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">이 존에 등록된 부스가 없어요.</p>
      ) : (
        <BoothPrintSheet booths={visible} />
      )}
    </main>
  );
}
