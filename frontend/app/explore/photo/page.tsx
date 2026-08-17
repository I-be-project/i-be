"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  Check,
  Image as ImageIcon,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Toast, type ToastVariant } from "@/components/Toast";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, uploadPhoto } from "@/lib/api";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";
import { CameraCapture } from "@/components/photo/CameraCapture";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { useFlowGuard, useBlockBack } from "@/lib/explore/flow";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// 카드 예시 이미지(public/photo-guide/card-layout.png) 안에서 사진이 들어갈 자리.
// 이미지 크기에 상관없이 겹쳐지도록 비율(%)로 잡는다.
const PHOTO_SLOT = { left: "18.2%", top: "20.6%", width: "22.3%", height: "59.2%" };

const GOOD_EXAMPLES = [
  "증명사진 (제일 좋아)",
  "정면을 보고 눈·코·입이 다 보이는 사진",
  "혼자 나오고, 얼굴이 크게 찍힌 사진",
];

const BAD_EXAMPLES = [
  "얼굴이 가려진 사진",
  "여러 명이 함께 나온 사진",
  "너무 멀리서 찍어 얼굴이 작은 사진",
];

// 설문(Q7~9)을 마친 뒤 도착하는 마지막 단계.
// 사진을 왜 받는지(카드의 어느 자리에 들어가는지)와 어떤 사진이 좋은지를 먼저 보여주고 받는다.
export default function ExplorePhotoPage() {
  const router = useRouter();
  // 설문을 마쳐야 들어올 수 있고, 여기서부터는 뒤로 돌아갈 수 없다.
  // 사진을 안 올린 채 나갔다 다시 들어오면 resumeScreen이 이 화면으로 되돌려준다.
  const { ready } = useFlowGuard("photo");
  useBlockBack();

  const setHasPhoto = useSessionStore((state) => state.setHasPhoto);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(
    null,
  );

  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 미리보기 URL 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant });
  };

  // 파일 하나를 검증 후 선택 상태로 반영한다. (갤러리·카메라 공용)
  const applySelectedFile = (selected: File): boolean => {
    // 백엔드도 400으로 막지만, 사용자 경험상 먼저 걸러준다.
    if (!ALLOWED_TYPES.includes(selected.type)) {
      showToast("jpeg, png, webp 형식의 사진만 올릴 수 있어.", "error");
      return false;
    }
    if (selected.size > MAX_BYTES) {
      showToast("10MB 이하 사진만 올릴 수 있어.", "error");
      return false;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 발생하도록 리셋
    if (!selected) return;
    applySelectedFile(selected);
  };

  // 웹캠 촬영 + 크롭 완료
  const handleCameraCapture = (captured: File) => {
    setCameraOpen(false);
    applySelectedFile(captured);
  };

  const handleUpload = async () => {
    const { studentToken } = useSessionStore.getState();
    if (!file || !studentToken || uploading) return;
    setUploading(true);
    try {
      await uploadPhoto(studentToken, file);
      setHasPhoto(true);
      router.push("/explore/pending-card");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        showToast("로그인이 만료됐어. 다시 로그인하면 여기서 이어서 올릴 수 있어.", "error");
        setTimeout(() => router.replace("/login"), 1600);
        return;
      }
      // 사진은 카드에 반드시 필요하므로 실패를 넘기지 않고 그 자리에서 다시 시도하게 한다.
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : "사진을 올리지 못했어. 잠시 뒤 다시 시도해줘.";
      showToast(message, "error");
      setUploading(false);
    }
  };

  // 복원 전이거나 진입 조건 미충족이면 가드가 리다이렉트할 때까지 그리지 않는다.
  if (!ready) return <FlowLoading mood="night" />;

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden font-sans">
      <VoyageBackground variant="soft" />

      {/* 헤더 — 지금이 어떤 단계이고 무엇을 하면 되는지만 말한다 */}
      <div className="relative z-10 px-7 pb-7 pt-10">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-100/80 px-3 py-1 text-[12px] font-bold tracking-wide text-sky-700">
          마지막 단계
        </p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-ink">
          사진 한 장만
          <br />
          올려줘
        </h1>
        <p className="mt-3 break-keep text-[15px] font-medium leading-relaxed text-ink-muted">
          질문은 모두 끝났어. 이제 사진만 올리면 네 카드가 완성돼.
        </p>
      </div>

      {/* 본문 시트 — 사진의 쓰임 → 좋은 사진 → 선택 순서로 읽힌다 */}
      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          "relative z-10 mt-auto flex flex-1 flex-col gap-8 rounded-t-[2rem] bg-white px-6 pt-8 shadow-[0_-12px_40px_rgba(37,99,235,0.12)]",
          // CTA가 떠 있을 때만 그만큼 바닥을 비운다.
          file ? "pb-40" : "pb-12",
        )}
      >
        {/* 1. 사진이 어디에 쓰이는지 */}
        <section>
          <h2 className="text-[17px] font-black tracking-tight text-ink">
            사진은 어디에 쓰여?
          </h2>
          <p className="mt-1.5 break-keep text-[14px] font-medium leading-relaxed text-ink-muted">
            행사 당일 받는 카드의 <b className="font-bold text-ink-soft">왼쪽 자리</b>에
            들어가. 나머지 칸은 네가 방금 답한 내용으로 채워져.
          </p>

          <div className="relative mt-4 overflow-hidden rounded-2xl ring-1 ring-zinc-200/80">
            <Image
              src="/photo-guide/card-layout.png"
              alt="카드 예시 — 왼쪽에 사진, 오른쪽에 이름과 소개가 들어간다"
              width={1580}
              height={996}
              className="h-auto w-full select-none"
              draggable={false}
            />
            {/* 사진이 들어갈 자리를 짚어준다 */}
            <motion.div
              aria-hidden
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute rounded-lg ring-[3px] ring-sky-500 ring-offset-2 ring-offset-white/0"
              style={PHOTO_SLOT}
            />
          </div>
          <p className="mt-2.5 text-center text-[13px] font-bold text-sky-700">
            파란 칸에 네 사진이 들어가
          </p>
        </section>

        {/* 2. 어떤 사진이 좋은지 */}
        <section>
          <h2 className="text-[17px] font-black tracking-tight text-ink">
            어떤 사진이 좋아?
          </h2>
          <p className="mt-1.5 break-keep text-[14px] font-medium leading-relaxed text-ink-muted">
            얼굴이 잘 보이는 사진일수록 카드가 잘 나와.
          </p>

          <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-zinc-200/80">
            <Image
              src="/photo-guide/photo-examples.png"
              alt="좋은 사진과 좋지 않은 사진 예시"
              width={1536}
              height={1024}
              className="h-auto w-full select-none"
              draggable={false}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200/70">
              <div className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
                <p className="text-[14px] font-bold text-emerald-900">
                  이런 사진이 좋아
                </p>
              </div>
              <ul className="mt-2 flex flex-col gap-1 pl-[30px]">
                {GOOD_EXAMPLES.map((label) => (
                  <li
                    key={label}
                    className="break-keep text-[13.5px] font-medium leading-relaxed text-emerald-800/90"
                  >
                    · {label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl bg-rose-50 px-4 py-3 ring-1 ring-rose-200/70">
              <div className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500">
                  <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
                <p className="text-[14px] font-bold text-rose-900">이런 사진은 안 돼</p>
              </div>
              <ul className="mt-2 flex flex-col gap-1 pl-[30px]">
                {BAD_EXAMPLES.map((label) => (
                  <li
                    key={label}
                    className="break-keep text-[13.5px] font-medium leading-relaxed text-rose-800/90"
                  >
                    · {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 기준을 안 지켰을 때 무슨 일이 생기는지 — 가이드를 지킬 이유를 알려준다 */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-200/70">
            <AlertTriangle
              className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600"
              strokeWidth={2.5}
            />
            <p className="break-keep text-[13.5px] font-semibold leading-relaxed text-amber-900">
              얼굴이 잘 안 보이는 사진을 올리면 카드에 네 얼굴이 제대로 들어가지 않아.
              다시 찍어서라도 얼굴이 잘 나온 사진으로 올려줘.
            </p>
          </div>
        </section>

        {/* 3. 사진 고르기 */}
        <section>
          <h2 className="text-[17px] font-black tracking-tight text-ink">
            사진 올리기
          </h2>

          {/* 숨겨진 갤러리 파일 입력 */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={handleFileChange}
          />

          {previewUrl ? (
            <div className="mt-4 flex w-full flex-col items-center">
              <div
                className="h-44 w-44 rounded-full border-4 border-solid border-sky-100 bg-zinc-100 bg-cover bg-center shadow-[0_10px_28px_rgba(37,99,235,0.15)]"
                style={{ backgroundImage: `url(${previewUrl})` }}
                role="img"
                aria-label="선택한 사진 미리보기"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading}
                className="mt-5 h-11 gap-2 rounded-full border-zinc-300 px-5 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
              >
                <RefreshCw className="h-4 w-4" />
                다시 선택
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid w-full grid-cols-1 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCameraOpen(true)}
                className="h-14 justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 text-base font-bold text-ink-soft shadow-none transition-all hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
              >
                <Camera className="h-5 w-5 text-sky-600" />
                지금 찍기
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => galleryInputRef.current?.click()}
                className="h-14 justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 text-base font-bold text-ink-soft shadow-none transition-all hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
              >
                <ImageIcon className="h-5 w-5 text-sky-600" />
                갤러리에서 고르기
              </Button>
            </div>
          )}
        </section>
      </motion.section>

      {/* 하단 고정 CTA — 사진을 고른 뒤에만 올라온다.
          항상 띄우면 가이드 이미지를 계속 가리고, 맨 아래에서는 아무 일도 안 하는 버튼이 된다. */}
      <AnimatePresence>
        {file ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 bg-gradient-to-t from-white via-white/95 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8"
          >
            <CtaButton onClick={handleUpload} disabled={uploading}>
              {uploading ? "올리는 중..." : "이 사진으로 할래"}
            </CtaButton>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {cameraOpen ? (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setCameraOpen(false)}
            onFallback={() => {
              setCameraOpen(false);
              galleryInputRef.current?.click();
            }}
          />
        ) : null}
      </AnimatePresence>

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </main>
  );
}
