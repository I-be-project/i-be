"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronLeft, Image as ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, type ToastVariant } from "@/components/Toast";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, uploadPhoto } from "@/lib/api";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";
import { CameraCapture } from "@/components/photo/CameraCapture";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export default function SignupPhotoPage() {
  const router = useRouter();
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const studentToken = useSessionStore((state) => state.studentToken);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 토큰이 없으면 로그인으로 돌려보낸다. 단, localStorage 복원(hasHydrated) 전에는 보류.
  useEffect(() => {
    if (hasHydrated && !studentToken) router.replace("/login");
  }, [hasHydrated, studentToken, router]);

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
    if (!file || !studentToken || uploading) return;
    setUploading(true);
    try {
      await uploadPhoto(studentToken, file);
      router.push("/explore");
    } catch (err) {
      // TODO: storage 연동 완료되면 이 임시 처리(500/네트워크 시 그냥 진행) 제거.
      //       현재 백엔드 StorageClient(S3)가 미구현이라 업로드는 500을 반환한다.
      if (err instanceof ApiError && (err.status === 500 || err.status === 0)) {
        showToast("사진 업로드는 곧 지원될 예정이에요. 일단 다음으로 진행할게요!", "info");
        setTimeout(() => router.push("/explore"), 1500);
      } else if (err instanceof ApiError && err.status === 401) {
        showToast("로그인이 만료됐어. 다시 로그인해줘.", "error");
        setTimeout(() => router.replace("/login"), 1500);
      } else {
        const message =
          err instanceof ApiError ? err.message : "업로드에 실패했어. 다시 시도해줘.";
        showToast(message, "error");
        setUploading(false);
      }
    }
  };

  // 복원 전이거나 토큰이 없으면 빈 화면 (복원 대기 또는 리다이렉트 진행 중)
  if (!hasHydrated || !studentToken) return null;

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden font-sans">
      <VoyageBackground variant="soft" />

      {/* 앱 상단 바 */}
      <div className="relative z-10 flex items-center px-5 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 text-ink backdrop-blur transition-colors hover:bg-white/80"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* 헤더 */}
      <div className="relative z-10 px-7 pb-8 pt-6">
        <p className="mb-2 text-sm font-bold tracking-wide text-sky-600">
          탐험대 등록 · 2/2
        </p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-ink">
          대원증에 붙일
          <br />
          사진을 담아줘
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-ink-muted">
          별빛이 내린 밤, 탐험대원증에 네 얼굴이 빛날 거야. 한마당에서 친구들에게 보여줄 나만의 표식이야.
        </p>
        <p className="mt-2 text-sm font-bold leading-relaxed text-sky-600">
          너의 사진을 선택해줘.
        </p>
      </div>

      {/* 바텀 시트 */}
      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mt-auto flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-8 pt-7 shadow-[0_-12px_40px_rgba(37,99,235,0.12)]"
      >
        {/* 숨겨진 갤러리 파일 입력 */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleFileChange}
        />

        {previewUrl ? (
          <div className="flex w-full flex-col items-center">
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
          <div className="grid w-full grid-cols-1 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCameraOpen(true)}
              className="h-14 justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 text-base font-bold text-ink-soft shadow-none transition-all hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
            >
              <Camera className="h-5 w-5 text-sky-600" />
              사진 촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              className="h-14 justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 text-base font-bold text-ink-soft shadow-none transition-all hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
            >
              <ImageIcon className="h-5 w-5 text-sky-600" />
              갤러리에서 선택
            </Button>
          </div>
        )}

        {/* 하단 고정 액션 */}
        <div className="mt-auto pt-8">
          <CtaButton onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? "올리는 중..." : "탐험 준비 완료"}
          </CtaButton>
        </div>
      </motion.section>

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
