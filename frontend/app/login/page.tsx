"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityFields, type IdentityValues } from "@/components/auth/IdentityFields";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, loginStudent } from "@/lib/api";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-indigo-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100";

export default function LoginPage() {
  const router = useRouter();
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
      // 로그인 후엔 프로필 화면으로. 설문 완료 여부 분기는 프로필에서 처리한다.
      router.push(`/profile/${res.student_id}`);
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
      <CelestialBackground variant="soft" />

      {/* 앱 상단 바 */}
      <div className="relative z-10 flex items-center px-5 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 text-[#2a2550] backdrop-blur transition-colors hover:bg-white/80"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* 헤더 */}
      <div className="relative z-10 px-7 pb-8 pt-6">
        <p className="mb-2 text-sm font-bold tracking-wide text-indigo-500">로그인</p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-[#2a2550]">
          다시 만나서<br />반가워
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-[#5b5685]">
          가입할 때 입력한 학교 정보와 비밀번호로 들어와줘.
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
                placeholder="생년월일 8자리 (예: 20100101)"
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
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-14 w-full rounded-2xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-bold text-white shadow-[0_10px_24px_rgba(124,77,229,0.3)] transition-all hover:shadow-[0_14px_30px_rgba(124,77,229,0.4)] active:scale-[0.99]"
            >
              {loading ? "들어가는 중..." : "로그인"}
            </Button>

            <p className="mt-5 text-center text-sm font-medium text-zinc-500">
              아직 등록하지 않았다면{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="font-bold text-indigo-600 hover:underline"
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
