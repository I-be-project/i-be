"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { scanBoothPath, scanPersonaPath } from "@/lib/scanBoothCode";
import { kioskCheckinMessage, kioskCheckinUrl, sendKioskCheckin } from "@/lib/kioskCheckin";
import { useSessionStore } from "@/store/useSessionStore";

/** 탭 공용 카메라 버튼이 여는 전체 화면 QR 스캐너. 닫히면 스캐너가 언마운트되며 카메라도 꺼진다. */
export function QrScanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="inset-0 top-0 left-0 block h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none bg-black p-0 text-white ring-0 sm:max-w-none">
      {open && <QrScanner onOpenChange={onOpenChange} />}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10">
        <div>
          <DialogTitle className="text-xl font-black text-white">QR 스캔</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-white/75">부스·키오스크·페르소나 카드의 QR을 네모 안에 맞춰줘.</DialogDescription>
        </div>
        <DialogClose aria-label="닫기" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors active:bg-white/25"><X size={22} /></DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}

const CORNERS = ["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl"];

// onOpenChange는 effect 의존성이라 안정적인 setter를 그대로 받는다(인라인 함수면 렌더마다 카메라가 재시작됨).
function QrScanner({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("카메라를 켜는 중…");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => stream?.getTracks().forEach((track) => track.stop());
    const start = async () => {
      setError(false);
      setStatus("카메라 접근을 허용해줘.");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("카메라를 사용할 수 없는 환경이야. HTTPS로 접속하거나 휴대폰 기본 카메라로 QR을 찍어줘.");
        const { default: jsQR } = await import("jsqr");
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active) { stop(); return; }
        const video = videoRef.current;
        if (!video) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        if (!active) { stop(); return; }
        setStatus("QR을 네모 안에 맞춰줘.");
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("QR 스캔을 시작하지 못했어. 다른 브라우저에서 시도해줘.");
        const scan = () => {
          if (!active) return;
          if (video.readyState >= 2 && video.videoWidth) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
            if (result) {
              const kioskUrl = kioskCheckinUrl(result.data);
              const studentId = useSessionStore.getState().studentId;
              if (kioskUrl && studentId) {
                // 같은 QR을 연달아 보내지 않도록 카메라부터 멈추고 한 번만 보낸다.
                active = false; stop();
                setStatus("키오스크에 보내는 중…");
                void sendKioskCheckin(kioskUrl, studentId).then((code) => {
                  setStatus(kioskCheckinMessage(code));
                  if (code >= 500) setError(true);
                });
                return;
              }
              const path = scanBoothPath(result.data) ?? scanPersonaPath(result.data);
              if (path) { active = false; stop(); onOpenChange(false); router.push(path); return; }
              setStatus("한마당 QR이 아니야. 부스나 페르소나 카드의 QR을 찍어줘.");
            }
          }
          timer = setTimeout(scan, 200);
        };
        scan();
      } catch (err) {
        stop();
        if (!active) return;
        setError(true);
        setStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "카메라 권한이 필요해. 브라우저 설정에서 카메라를 허용하고 다시 시도해줘." : err instanceof DOMException && err.name === "NotFoundError" ? "연결된 카메라가 없어. 카메라가 있는 휴대폰에서 QR을 찍어줘." : err instanceof Error ? err.message : "카메라를 켜지 못했어. 다시 시도해줘.");
      }
    };
    void start();
    return () => { active = false; clearTimeout(timer); stop(); };
  }, [attempt, router, onOpenChange]);
  return <>
    <video ref={videoRef} muted playsInline autoPlay aria-label="QR 스캔 카메라" className="absolute inset-0 h-full w-full object-cover" />
    {/* 네모 바깥을 어둡게 — 큰 box-shadow로 마스크를 대신한다. */}
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(72vw,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]">
      {CORNERS.map((c) => <span key={c} className={`absolute size-12 border-white ${c}`} />)}
    </div>
    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <p role={error ? "alert" : "status"} className="max-w-sm rounded-2xl bg-white px-5 py-3 text-center text-sm font-bold leading-relaxed text-hm-blue shadow-lg">{status}</p>
      {error && <button onClick={() => setAttempt((n) => n + 1)} className="flex items-center gap-2 rounded-full bg-hm-blue px-5 py-3 text-sm font-bold text-white shadow-lg"><Camera size={18} />다시 시도</button>}
    </div>
  </>;
}
