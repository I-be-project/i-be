"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, GraduationCap, Pencil, RotateCcw } from "lucide-react";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toast, type ToastVariant } from "@/components/Toast";
import { PersonaCard } from "@/components/card/PersonaCard";
import { useSessionStore } from "@/store/useSessionStore";
import { genderLabel } from "@/lib/utils";
import {
  ApiError,
  getMyProfile,
  updateMyProfile,
  uploadPhoto,
  type ProfileSummary,
} from "@/lib/api";

const cardClass =
  "rounded-3xl border border-solid border-white/70 bg-white/85 p-6 shadow-[0_12px_32px_rgba(37,99,235,0.10)] backdrop-blur-xl";

// 이름 편집 폼 스타일 — app/signup/page.tsx와 동일한 값을 그대로 맞췄다.
const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-sky-100";

// 사진 수정 시 프론트 선검증 (백엔드와 동일 기준).
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export default function ProfilePage() {
  const router = useRouter();
  const studentToken = useSessionStore((state) => state.studentToken);
  const studentInfo = useSessionStore((state) => state.studentInfo);
  const setStudentInfo = useSessionStore((state) => state.setStudentInfo);

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // 업로드한 사진은 백엔드 응답에 URL이 없어, 선택한 파일로 즉시 미리보기를 만든다.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  // 이름 편집 — 별도 페이지 이동 없이 이 화면 안에서 처리한다. (성별은 수정 대상 아님)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // 인증가드는 상위 app/(tabs)/layout.tsx가 이미 보장한다(hasHydrated 대기 → 없으면 /login).
  // 여기서는 토큰이 확보된 뒤 프로필만 조회한다.
  useEffect(() => {
    if (!studentToken) return;

    let active = true;
    setLoading(true);
    getMyProfile(studentToken)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setToast({
          message:
            err instanceof ApiError ? err.message : "프로필을 불러오지 못했어.",
          variant: "error",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [studentToken, router]);

  // 언마운트 시 마지막 미리보기 URL 해제(메모리 누수 방지).
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택 가능하도록 리셋
    if (!selected || !studentToken) return;

    if (!ALLOWED_PHOTO_TYPES.includes(selected.type)) {
      setToast({ message: "jpeg, png, webp 형식의 사진만 올릴 수 있어.", variant: "error" });
      return;
    }
    if (selected.size > MAX_PHOTO_BYTES) {
      setToast({ message: "10MB 이하 사진만 올릴 수 있어.", variant: "error" });
      return;
    }

    setUploadingPhoto(true);
    try {
      await uploadPhoto(studentToken, selected);
      // 업로드 성공 후 즉시 보여줄 수 있도록 로컬 미리보기 갱신(이전 URL은 해제).
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(selected);
      });
      setToast({ message: "사진이 수정됐어!", variant: "info" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "사진 수정에 실패했어. 다시 시도해줘.",
        variant: "error",
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // 학생 정보는 백엔드 응답(profile.student) 우선, 없으면 가입 때 저장한 스토어로 폴백.
  // 로그인만 한 경우(스토어가 비어도) 백엔드 값으로 정상 표시된다.
  const displayStudent = profile?.student
    ? {
        school: profile.student.school,
        grade: profile.student.grade,
        classNo: profile.student.class_no,
        studentNo: profile.student.student_no,
        name: profile.student.name,
        gender: profile.student.gender,
        photoUrl: profile.student.photo_url,
      }
    : studentInfo
      ? { ...studentInfo, photoUrl: null }
      : null;

  // 방금 업로드한 미리보기를 우선, 없으면 백엔드 사진 URL을 쓴다.
  const photoSrc = photoPreview ?? displayStudent?.photoUrl ?? null;

  const startEditingProfile = () => {
    if (!displayStudent) return;
    setEditName(displayStudent.name);
    setIsEditing(true);
  };

  const cancelEditingProfile = () => {
    setIsEditing(false);
  };

  const handleSaveProfile = async () => {
    const trimmedName = editName.trim();
    if (!studentToken || !trimmedName || savingProfile) return;

    setSavingProfile(true);
    try {
      const updated = await updateMyProfile(studentToken, { name: trimmedName });
      setProfile(updated);
      // studentInfo(localStorage 폴백)도 이름만 갱신 — 다른 필드(성별 등)는 그대로 둔다.
      if (updated.student && studentInfo) {
        setStudentInfo({ ...studentInfo, name: updated.student.name });
      }
      setIsEditing(false);
      setToast({ message: "정보가 수정됐어!", variant: "info" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "정보 수정에 실패했어. 다시 시도해줘.",
        variant: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-5 pb-28 pt-10 font-sans">
      <VoyageBackground variant="soft" />
      {/* 사진 수정용 숨겨진 입력 */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handlePhotoChange}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-2xl flex-col gap-6"
      >
        <div className="glass-card self-start rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wider text-sky-700">
          내 탐험 기록
        </div>

        {/* 학생 정보 — 정사각형 사진 → 이름 → 학교/학년/반/번호 세로 정렬. */}
        <section className={`${cardClass} flex flex-col items-center`}>
          {/* 정사각형 사진(클릭하면 수정). 업로드한 사진은 미리보기로 즉시 표시. */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="group relative aspect-square w-40 overflow-hidden rounded-2xl border-4 border-solid border-sky-100 bg-sky-50 transition-colors hover:border-sky-200 disabled:opacity-60"
            aria-label="사진 수정"
          >
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt="내 사진"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-muted">
                <Camera className="h-8 w-8 text-sky-400" />
                <span className="text-xs font-bold">사진 추가</span>
              </span>
            )}
            {/* 호버 시 수정 안내 오버레이 */}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-bold text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              {uploadingPhoto ? "올리는 중..." : "사진 수정"}
            </span>
          </button>

          {displayStudent ? (
            isEditing ? (
              <div className="mt-4 w-full max-w-xs space-y-4">
                <div>
                  <label htmlFor="edit-name" className={labelClass}>
                    이름
                  </label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="홍길동"
                    disabled={savingProfile}
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelEditingProfile}
                    disabled={savingProfile}
                    className="h-11 flex-1 rounded-full border-zinc-300 text-sm font-bold text-zinc-600 hover:bg-zinc-50"
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile || !editName.trim()}
                    className="h-11 flex-1 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-sm font-bold text-white hover:shadow-md"
                  >
                    {savingProfile ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* 이름 — 가운데 정렬, 크게 */}
                <h2 className="mt-4 text-center text-2xl font-extrabold text-ink">
                  {displayStudent.name}
                </h2>
                {/* 학교 / 학년 / 반 / 번호 */}
                <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                  <GraduationCap className="h-4 w-4 text-sky-600" />
                  <span>
                    {displayStudent.school} · {displayStudent.grade}학년{" "}
                    {displayStudent.classNo}반 {displayStudent.studentNo}번 ·{" "}
                    {genderLabel(displayStudent.gender)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={startEditingProfile}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-solid border-zinc-200 px-3.5 py-1.5 text-xs font-bold text-zinc-600 transition-colors hover:border-sky-300 hover:text-sky-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  정보 수정
                </button>
              </>
            )
          ) : loading ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-5 w-48" />
            </div>
          ) : (
            <p className="mt-4 text-sm font-medium text-ink-muted">
              정보를 불러올 수 없어요.
            </p>
          )}
        </section>

        {/* 설문 결과 — getMyProfile 결과에 의존. 학생 정보와 독립적. */}
        <section>{renderResult()}</section>
      </motion.div>

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </main>
  );

  function renderResult() {
    if (loading) {
      return (
        <div className={cardClass}>
          <Skeleton className="mb-4 h-6 w-32" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      );
    }

    if (!profile) {
      // 조회 실패(401 외) — 토스트로 안내, 자리만 비워둔다.
      return (
        <div className={cardClass}>
          <p className="text-sm font-medium text-ink-muted">
            설문 결과를 불러오지 못했어. 잠시 후 다시 시도해줘.
          </p>
        </div>
      );
    }

    // 설문 미완료 — 페르소나/카드 UI는 전혀 렌더하지 않는다.
    if (!profile.has_completed) {
      return (
        <div className={`${cardClass} flex flex-col items-center text-center`}>
          <h2 className="mb-2 text-xl font-extrabold text-ink">
            아직 나로섬에 다녀오지 않았구나
          </h2>
          <p className="mb-6 text-sm font-medium leading-relaxed text-ink-muted">
            나의 미래 역할을 찾으러 떠나볼까?
          </p>
          <CtaButton onClick={() => router.push("/explore")}>
            탐험하러 가기
          </CtaButton>
        </div>
      );
    }

    // 설문 완료 — 페르소나 + 카드 이미지 + 다시 하기.
    return (
      <div className="flex flex-col gap-6">
        <div className={`${cardClass} flex flex-col items-center text-center`}>
          <div className="mb-2 rounded-full border border-solid border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold tracking-wider text-sky-700">
            탐험 완료
          </div>
          <p className="text-sm font-medium text-ink-muted">
            나로섬 탐험이 끝나고, 너의 탐험대원증이 발급됐어!
          </p>
        </div>

        {profile.persona ? (
          <PersonaCard
            // PersonaCard는 name/tagline/keywords만 사용. 타입 호환 위해 빈 배열 채움.
            persona={{ ...profile.persona, recommendedBooths: [] }}
          />
        ) : null}

        {profile.card?.card_image_url ? (
          <div className={cardClass}>
            <h2 className="mb-3 text-lg font-extrabold text-ink">발급된 탐험대원증</h2>
            <div
              className="aspect-[1.58/1] w-full rounded-2xl border border-solid border-sky-100 bg-sky-50 bg-cover bg-center shadow-sm"
              style={{ backgroundImage: `url(${profile.card.card_image_url})` }}
              role="img"
              aria-label="발급된 탐험대원증"
            />
          </div>
        ) : (
          <div className={`${cardClass} text-center`}>
            <p className="text-sm font-medium text-ink-muted">
              카드 준비 중이에요. 조금만 기다려줘!
            </p>
          </div>
        )}

        {/* 다시 하기 — 관리자 전역 스위치(retry_enabled)가 켜진 동안에만 활성. */}
        <div className="flex flex-col items-center gap-2">
          <CtaButton
            disabled={!profile.retry_enabled}
            onClick={() => router.push("/explore")}
          >
            <RotateCcw className="h-5 w-5" />
            다시 탐험하기
          </CtaButton>
          {!profile.retry_enabled && (
            <p className="text-xs font-medium text-ink-muted/70">
              지금은 다시 탐험하기가 열려있지 않아요.
            </p>
          )}
        </div>
      </div>
    );
  }
}
