"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IdentityFields, type IdentityValues } from "@/components/auth/IdentityFields";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, getMyProfile, loginStudent } from "@/lib/api";
import { reconcileCompletionFromProfile, resumeScreen, resumePath } from "@/lib/explore/flow";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-sky-100";

// 로그인 후 돌아갈 곳으로는 내부 경로만 허용한다. "//evil.com" 같은 프로토콜 상대 URL이나
// 절대 URL을 그대로 쓰면 오픈 리다이렉트가 된다.
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useSessionStore((state) => state.setAuth);

  const [identity, setIdentity] = useState<IdentityValues>({
    school: "",
    grade: "",
    classNo: "",
    studentNo: "",
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleIdentityChange = (field: keyof IdentityValues, value: string) => {
    setIdentity((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (
      !identity.school.trim() ||
      !identity.grade ||
      !identity.classNo ||
      !identity.studentNo ||
      !password
    ) {
      setError("모든 항목을 입력해줘.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginStudent({
        school: identity.school.trim(),
        grade: Number(identity.grade),
        class_no: Number(identity.classNo),
        student_no: Number(identity.studentNo),
        password,
      });
      setAuth(res.student_token, res.student_id);

      // 딥링크(예: 부스 QR /b/<code>)에서 넘어왔으면 그쪽을 우선한다.
      // 진행상황(resumePath)은 localStorage에만 있어서, QR을 다른 브라우저에서 열었다면
      // 비어 있다. 그 값으로 라우팅하면 카드를 이미 받은 학생도 가입 화면으로 튕긴다.
      const next = safeNextPath(searchParams.get("next"));
      if (next) {
        router.replace(next);
        return;
      }

      // 로컬 진행상황(surveyCompleted 등)은 localStorage 영속이라 다른 기기·초기화된
      // 저장소에서는 실제로 완료했어도 "진행 이력 없음"으로 보일 수 있다. 라우팅을
      // 결정하기 전에 백엔드 완료 여부로 한 번 동기화한다(조회 실패 시 로컬 기준 진행).
      try {
        const profile = await getMyProfile(res.student_token);
        reconcileCompletionFromProfile(profile);
      } catch {
        // 무시 — 로컬 상태 기준으로 계속 진행(fail-open)
      }
      // 같은 학생의 재로그인이면 진행상황이 보존된다(setAuth). 진행 중이던 설문이
      // 있거나 이미 완료했으면 그 화면으로 바로 이어가고(완료 시 공개 대기 화면),
      // 아직 시작 전(신규/다른 학생)이면 프로필로 간다.
      const s = useSessionStore.getState();
      const screen = resumeScreen(s);
      if (screen === "explore") {
        router.push(`/profile/${res.student_id}`);
      } else {
        router.replace(resumePath(s));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 백엔드가 학번/비밀번호 중 무엇이 틀렸는지 구분해주지 않으므로 묶어서 안내.
        setError("학번 또는 비밀번호가 올바르지 않아요.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("알 수 없는 오류가 발생했어. 잠시 후 다시 시도해줘.");
      }
    } finally {
      setLoading(false);
    }
  };

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
        <p className="mb-2 text-sm font-bold tracking-wide text-sky-600">돌아온 탐험대원</p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-ink">
          다시 만나서<br />반가워
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-ink-muted">
          나로섬 선착장으로 다시 올라타. 가입할 때 적었던 학교 정보와 비밀번호를 입력해줘.
        </p>
      </div>

      {/* 바텀 시트 — 앱처럼 아래에서 올라오는 흰 면 */}
      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mt-auto flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-8 pt-7 shadow-[0_-12px_40px_rgba(80,70,140,0.12)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col" noValidate>
          <div className="space-y-5">
            <IdentityFields
              values={identity}
              onChange={handleIdentityChange}
              disabled={loading}
            />

            <div>
              <label htmlFor="password" className={labelClass}>
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 4자리 (예: 1029)"
                disabled={loading}
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-solid border-red-200 bg-red-50 px-4 py-3"
              >
                <p className="text-sm font-medium text-red-600">{error}</p>
              </motion.div>
            )}
          </div>

          {/* 하단 고정 액션 */}
          <div className="mt-auto pt-8">
            <CtaButton type="submit" disabled={loading}>
              {loading ? "승선하는 중..." : "다시 승선하기"}
            </CtaButton>

            <p className="mt-5 text-center text-sm font-medium text-zinc-500">
              아직 등록하지 않았다면{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="font-bold text-sky-600 hover:underline"
              >
                회원가입
              </button>
            </p>
          </div>
        </form>
      </motion.section>
    </main>
  );
}

// useSearchParams를 쓰는 컴포넌트는 Suspense 경계 안에 둬야 한다(프리렌더 요구사항).
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-[100dvh] overflow-hidden font-sans">
          <VoyageBackground variant="soft" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
