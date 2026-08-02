"use client";

import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminBooth } from "@/lib/api";
import { boothQrFilename, renderBoothQrPng } from "@/lib/boothQr";

interface BoothQrDialogProps {
  /** null이면 닫힌 상태. */
  booth: AdminBooth | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * 부스 QR 미리보기 + 인쇄용 PNG 다운로드 + 링크 복사.
 *
 * booth가 바뀔 때마다 렌더 상태(pngDataUrl/error/copied)를 초기화해야 한다. effect에서
 * setState로 리셋하는 대신, 다이얼로그가 열려 있을 때만 내부(BoothQrBody)를 마운트하고
 * booth.id로 key를 줘서 매번 새 인스턴스로 시작하게 한다 — BoothFormDialog와 같은 패턴
 * (react-hooks/set-state-in-effect 회피).
 */
export function BoothQrDialog({ booth, onOpenChange }: BoothQrDialogProps) {
  return (
    <Dialog open={booth !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {booth && <BoothQrBody key={booth.id} booth={booth} />}
      </DialogContent>
    </Dialog>
  );
}

interface BoothQrBodyProps {
  booth: AdminBooth;
}

/** 다이얼로그가 열려 있는 동안만 사는 실제 내용. 마운트 시점의 booth로 QR을 렌더링한다. */
function BoothQrBody({ booth }: BoothQrBodyProps) {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    renderBoothQrPng(booth.qr_url, booth.code)
      .then((dataUrl) => {
        if (active) setPngDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setError("QR 이미지를 만들지 못했어요.");
      });

    return () => {
      active = false;
    };
  }, [booth]);

  function download() {
    if (!pngDataUrl) return;
    const link = document.createElement("a");
    link.href = pngDataUrl;
    link.download = boothQrFilename(booth.code);
    link.click();
  }

  async function copyLink() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(booth.qr_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // localhost가 아닌 LAN 주소(예: http://192.168.x.x)는 secure context가 아니라
      // clipboard API 자체가 없거나 거부될 수 있다 — 위에 보이는 링크를 직접 선택하게 안내.
      setCopyError("복사하지 못했어요. 위 링크를 직접 선택해서 복사해주세요.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{booth.name} QR</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex justify-center rounded-lg border bg-white p-4">
          {error ? (
            <p className="py-16 text-sm text-destructive">{error}</p>
          ) : pngDataUrl ? (
            // 다운로드하는 것과 같은 이미지를 그대로 보여준다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pngDataUrl}
              alt={`${booth.name} 부스 QR (코드 ${booth.code})`}
              className="size-56 object-contain"
            />
          ) : (
            <Skeleton className="size-56" />
          )}
        </div>

        <p className="break-all text-center font-mono text-xs text-muted-foreground">
          {booth.qr_url}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => void copyLink()}
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "복사됨" : "링크 복사"}
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={!pngDataUrl}
            onClick={download}
          >
            <Download className="size-4" aria-hidden />
            PNG 저장
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          학생이 카드를 받은 뒤에 이 QR을 찍으면 방문이 기록돼요.
        </p>

        {copyError && (
          <p className="text-center text-sm text-destructive">{copyError}</p>
        )}
      </div>
    </>
  );
}
