"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ImageIcon,
  RefreshCw,
  RotateCcw,
  X,
  ZoomIn,
} from "lucide-react";

// 크롭 결과 출력 해상도(정사각형). 대원증 원형 아바타에 충분하면서 과하지 않은 크기.
const OUTPUT_SIZE = 720;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Step = "camera" | "crop";

interface CameraCaptureProps {
  /** 크롭까지 마친 정사각형 사진(File)을 돌려준다. */
  onCapture: (file: File) => void;
  /** 닫기(취소). */
  onClose: () => void;
  /** 카메라를 못 쓸 때 대신 갤러리 선택으로 넘어가는 폴백. */
  onFallback?: () => void;
}

/**
 * 웹캠으로 사진을 찍고 정사각형으로 크롭해 File로 반환하는 전체화면 오버레이.
 * 라이브러리 없이 getUserMedia + canvas만 사용한다.
 */
export function CameraCapture({
  onCapture,
  onClose,
  onFallback,
}: CameraCaptureProps) {
  const [step, setStep] = useState<Step>("camera");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // 촬영한 원본 이미지(크롭 단계 입력)
  const [captured, setCaptured] = useState<HTMLImageElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("이 브라우저에서는 카메라를 쓸 수 없어. 갤러리에서 골라줘.");
      return;
    }
    setError(null);
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
        setReady(true);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("카메라 권한이 필요해. 브라우저에서 카메라를 허용해줘.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("사용할 수 있는 카메라를 찾지 못했어. 갤러리에서 골라줘.");
      } else {
        setError("카메라를 켜지 못했어. 갤러리에서 골라줘.");
      }
    }
  }, []);

  // 카메라 단계에 진입할 때마다 스트림 시작 / 정리 (외부 장치 동기화라 effect가 맞다)
  useEffect(() => {
    if (step === "camera") {
      // startCamera 내부의 setState는 async 경로에서 실행된다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startCamera();
    }
    return () => stopStream();
  }, [step, startCamera, stopStream]);

  // 언마운트 시 확실히 정리
  useEffect(() => () => stopStream(), [stopStream]);

  const handleShoot = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // 현재 프레임을 캔버스에 그린다. 전면 카메라라 미리보기와 맞추기 위해 좌우 반전.
    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);

    const img = new Image();
    img.onload = () => {
      setCaptured(img);
      stopStream();
      setStep("crop");
    };
    img.src = canvas.toDataURL("image/jpeg", 0.95);
  };

  const handleCropDone = (file: File) => {
    onCapture(file);
  };

  const handleRetake = () => {
    setCaptured(null);
    setStep("camera");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
    >
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold text-white">
          {step === "camera" ? "사진 촬영" : "위치·크기 조절"}
        </p>
        <div className="h-10 w-10" />
      </div>

      {step === "camera" ? (
        <CameraStep
          videoRef={videoRef}
          ready={ready}
          error={error}
          onShoot={handleShoot}
          onRetry={startCamera}
          onFallback={onFallback}
        />
      ) : captured ? (
        <CropStep
          image={captured}
          onConfirm={handleCropDone}
          onRetake={handleRetake}
        />
      ) : null}
    </motion.div>
  );
}

/* ---------------- 카메라(촬영) 단계 ---------------- */

interface CameraStepProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
  onShoot: () => void;
  onRetry: () => void;
  onFallback?: () => void;
}

function CameraStep({
  videoRef,
  ready,
  error,
  onShoot,
  onRetry,
  onFallback,
}: CameraStepProps) {
  return (
    <>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="mx-8 max-w-xs text-center">
            <Camera className="mx-auto mb-4 h-10 w-10 text-white/50" />
            <p className="text-sm font-medium leading-relaxed text-white/90">
              {error}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-bold text-white transition-colors hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4" />
                다시 시도
              </button>
              {onFallback ? (
                <button
                  type="button"
                  onClick={onFallback}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-sm font-bold text-white transition-colors hover:bg-sky-400"
                >
                  <ImageIcon className="h-4 w-4" />
                  갤러리에서 선택
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* 전면 카메라는 거울처럼 좌우 반전해 보여준다 */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {/* 원형 가이드 오버레이 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="aspect-square w-[78%] max-w-[22rem] rounded-full border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            {!ready ? (
              <p className="absolute bottom-6 text-xs font-medium text-white/70">
                카메라를 켜는 중...
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* 셔터 */}
      {!error ? (
        <div className="flex items-center justify-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={onShoot}
            disabled={!ready}
            aria-label="촬영"
            className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white/80 bg-white/10 transition-transform active:scale-95 disabled:opacity-40"
          >
            <span className="h-14 w-14 rounded-full bg-white" />
          </button>
        </div>
      ) : null}
    </>
  );
}

/* ---------------- 크롭 단계 ---------------- */

interface CropStepProps {
  image: HTMLImageElement;
  onConfirm: (file: File) => void;
  onRetake: () => void;
}

function CropStep({ image, onConfirm, onRetake }: CropStepProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  // 이미지 중심 기준 팬 오프셋(px, 화면 좌표계)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  // 정사각형 프레임을 꽉 채우는(cover) 기본 배율
  const coverScale = frameSize ? frameSize / Math.min(iw, ih) : 0;
  const displayScale = coverScale * zoom;
  const dw = iw * displayScale;
  const dh = ih * displayScale;

  // 프레임 크기 측정
  useEffect(() => {
    const measure = () => {
      if (frameRef.current) setFrameSize(frameRef.current.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 이미지가 항상 프레임을 덮도록 오프셋을 제한
  const clamp = useCallback(
    (o: { x: number; y: number }, curDw: number, curDh: number) => {
      const maxX = Math.max(0, (curDw - frameSize) / 2);
      const maxY = Math.max(0, (curDh - frameSize) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, o.x)),
        y: Math.min(maxY, Math.max(-maxY, o.y)),
      };
    },
    [frameSize]
  );

  // 줌이 바뀌면 이미지 크기가 달라지므로, 화면·출력에는 항상 제한된 오프셋을 쓴다.
  // (raw offset은 state에 두고 렌더에서 파생값을 계산 — effect로 되돌려쓰지 않는다.)
  const view = clamp(offset, dw, dh);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.x);
    const ny = drag.current.oy + (e.clientY - drag.current.y);
    setOffset(clamp({ x: nx, y: ny }, dw, dh));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, zoom - e.deltaY * 0.0015)
    );
    setZoom(next);
  };

  // 두 손가락 핀치 줌
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinch.current = { dist: touchDist(e), zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const ratio = touchDist(e) / pinch.current.dist;
      setZoom(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.current.zoom * ratio))
      );
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null;
  };

  const handleConfirm = () => {
    if (busy || !frameSize) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    // 프레임(정사각형)에 대응하는 원본 픽셀 영역을 계산한다.
    const srcSize = frameSize / displayScale; // 프레임 한 변이 덮는 원본 픽셀 길이
    const srcX = (iw - srcSize) / 2 - view.x / displayScale;
    const srcY = (ih - srcSize) / 2 - view.y / displayScale;
    ctx.drawImage(
      image,
      srcX,
      srcY,
      srcSize,
      srcSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setBusy(false);
          return;
        }
        const file = new File([blob], "camera-photo.jpg", {
          type: "image/jpeg",
        });
        onConfirm(file);
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* 정사각형 크롭 프레임 */}
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative aspect-square w-full max-w-sm touch-none select-none overflow-hidden rounded-3xl bg-zinc-900"
        >
          {frameSize > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt="크롭할 사진"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: dw,
                height: dh,
                transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`,
              }}
            />
          ) : null}
          {/* 원형 마스크 가이드 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-full w-full rounded-full border border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>

        {/* 줌 슬라이더 */}
        <div className="mt-7 flex w-full max-w-sm items-center gap-3">
          <ZoomIn className="h-5 w-5 shrink-0 text-white/70" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="확대"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-sky-400"
          />
        </div>
      </div>

      {/* 하단 액션 */}
      <div className="flex items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onRetake}
          disabled={busy}
          className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          다시 찍기
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-sky-400 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {busy ? "처리 중..." : "이 사진 사용"}
        </button>
      </div>
    </>
  );
}

function touchDist(e: React.TouchEvent) {
  const [a, b] = [e.touches[0], e.touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
