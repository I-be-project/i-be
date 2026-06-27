"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, Image as ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, type ToastVariant } from "@/components/Toast";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, uploadPhoto } from "@/lib/api";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export default function SignupPhotoPage() {
  const router = useRouter();
  const studentToken = useSessionStore((state) => state.studentToken);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 토큰이 없으면(새로고침으로 유실 등) 로그인으로 돌려보낸다.
  useEffect(() => {
    if (!studentToken) router.replace("/login");
  }, [studentToken, router]);

  // 미리보기 URL 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ message, variant });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 발생하도록 리셋
    if (!selected) return;

    // 백엔드도 400으로 막지만, 사용자 경험상 먼저 걸러준다.
    if (!ALLOWED_TYPES.includes(selected.type)) {
      showToast("jpeg, png, webp 형식의 사진만 올릴 수 있어.", "error");
      return;
    }
    if (selected.size > MAX_BYTES) {
      showToast("10MB 이하 사진만 올릴 수 있어.", "error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
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

  const handleSkip = () => {
    router.push("/explore");
  };

  // 토큰 확인 전에는 빈 화면 (리다이렉트 진행 중)
  if (!studentToken) return null;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-10 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex w-full max-w-md flex-col items-center rounded-3xl border-2 border-solid border-zinc-300 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 self-start rounded-full border border-solid border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold tracking-wider text-zinc-700">
          사진 등록
        </div>

        <h1 className="mb-3 self-start text-3xl font-extrabold tracking-tight text-zinc-900 md:text-4xl">
          마지막으로, <span className="text-indigo-600">네 사진</span>을 담아줘
        </h1>
        <p className="mb-8 self-start text-sm font-medium leading-relaxed text-zinc-500 md:text-base">
          페르소나 카드에 들어갈 사진이야. 잘 나온 사진으로 골라봐!
        </p>

        {/* 숨겨진 파일 입력 — 모바일에선 capture가 카메라를 바로 띄운다 */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={handleFileChange}
        />
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
              className="h-44 w-44 rounded-full border-2 border-solid border-zinc-300 bg-zinc-100 bg-cover bg-center shadow-sm"
              style={{ backgroundImage: `url(${previewUrl})` }}
              role="img"
              aria-label="선택한 사진 미리보기"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading}
              className="mt-5 h-11 gap-2 rounded-xl border-zinc-300 px-5 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
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
              onClick={() => cameraInputRef.current?.click()}
              className="h-14 justify-center gap-2 rounded-xl border-2 border-zinc-300 text-base font-bold text-zinc-700 transition-all hover:scale-[1.02] hover:border-indigo-400 hover:bg-zinc-50 active:scale-[0.98]"
            >
              <Camera className="h-5 w-5 text-indigo-600" />
              사진 촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              className="h-14 justify-center gap-2 rounded-xl border-2 border-zinc-300 text-base font-bold text-zinc-700 transition-all hover:scale-[1.02] hover:border-indigo-400 hover:bg-zinc-50 active:scale-[0.98]"
            >
              <ImageIcon className="h-5 w-5 text-indigo-600" />
              갤러리에서 선택
            </Button>
          </div>
        )}

        <Button
          type="button"
          size="lg"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="mt-8 h-14 w-full rounded-xl border border-transparent bg-indigo-600 text-base font-bold text-white shadow-none transition-all hover:scale-[1.02] hover:bg-indigo-700 active:scale-[0.98]"
        >
          {uploading ? "올리는 중..." : "다음"}
        </Button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={uploading}
          className="mt-4 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 disabled:opacity-50"
        >
          사진 건너뛰기
        </button>
      </motion.div>

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </main>
  );
}
