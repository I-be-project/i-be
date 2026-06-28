"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityFields, type IdentityValues } from "@/components/auth/IdentityFields";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, loginStudent } from "@/lib/api";

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-700";
const inputClass =
  "h-12 rounded-xl border-zinc-300 bg-white px-4 text-base focus-visible:border-indigo-500";

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
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-10 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex w-full max-w-md flex-col rounded-3xl border-2 border-solid border-zinc-300 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 self-start rounded-full border border-solid border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-bold tracking-wider text-zinc-700">
          로그인
        </div>

        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-zinc-900 md:text-4xl">
          다시 <span className="text-indigo-600">만나서</span> 반가워
        </h1>
        <p className="mb-8 text-sm font-medium leading-relaxed text-zinc-500 md:text-base">
          가입할 때 입력한 학교 정보와 비밀번호로 들어와줘.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
              className="rounded-xl border border-solid border-red-200 bg-red-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-red-600">{error}</p>
            </motion.div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full h-14 rounded-xl border border-transparent bg-indigo-600 text-base font-bold text-white shadow-none transition-all hover:scale-[1.02] hover:bg-indigo-700 active:scale-[0.98]"
          >
            {loading ? "들어가는 중..." : "로그인"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-zinc-500">
          아직 등록하지 않았다면{" "}
          <button
            type="button"
            onClick={() => router.push("/signup")}
            className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            회원가입
          </button>
        </p>
      </motion.div>
    </main>
  );
}
