"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { TabPage } from "@/components/tabs/TabPage";
import { scanBoothPath } from "@/lib/scanBoothCode";

export default function ScanPage() {
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
        setStatus("부스 QR을 화면 안에 맞춰줘.");
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
              const path = scanBoothPath(result.data);
              if (path) { active = false; stop(); router.replace(path); return; }
              setStatus("한마당 부스 QR이 아니야. 부스에 있는 QR을 찍어줘.");
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
  }, [attempt, router]);
  return <TabPage title="QR 스캔" description="참여한 부스의 QR을 카메라로 찍어줘.">
    <Link href="/growth" className="flex items-center gap-2 text-sm font-bold text-hm-blue"><ArrowLeft size={18} />성장으로 돌아가기</Link>
    <section className="hm-card overflow-hidden p-4">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-950"><video ref={videoRef} muted playsInline autoPlay aria-label="QR 스캔 카메라" className="h-full w-full object-cover" /><div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80" /></div>
      <p role={error ? "alert" : "status"} className="mt-4 text-center text-sm leading-relaxed text-hm-blue">{status}</p>
      {error && <button onClick={() => setAttempt((n) => n + 1)} className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-hm-blue px-5 py-3 text-sm font-bold text-white"><Camera size={18} />다시 시도</button>}
    </section>
  </TabPage>;
}
