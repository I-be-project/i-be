"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IdentityFields, type IdentityValues } from "@/components/auth/IdentityFields";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, registerStudent } from "@/lib/api";
import { CelestialBackground } from "@/components/celestial/CelestialBackground";

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-700";
const inputClass =
  "h-12 rounded-xl border-zinc-300 bg-white px-4 text-base focus-visible:border-sky-500";

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useSessionStore((state) => state.setAuth);
  const setStudentInfo = useSessionStore((state) => state.setStudentInfo);

  const [identity, setIdentity] = useState<IdentityValues>({
    school: "",
    grade: "",
    classNo: "",
    studentNo: "",
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [loading, setLoading] = useState(false);

  const consentRef = useRef<HTMLDivElement>(null);

  const handleIdentityChange = (field: keyof IdentityValues, value: string) => {
    setIdentity((prev) => ({ ...prev, [field]: value }));
  };

  const scrollToConsent = () => {
    consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setIsConflict(false);

    // 기본 입력 검증 (백엔드도 검증하지만 사용자 경험상 먼저 막아준다)
    const grade = Number(identity.grade);
    const classNo = Number(identity.classNo);
    const studentNo = Number(identity.studentNo);

    if (
      !identity.school.trim() ||
      !identity.grade ||
      !identity.classNo ||
      !identity.studentNo ||
      !name.trim() ||
      !password
    ) {
      setError("모든 항목을 입력해줘.");
      return;
    }
    if (grade < 1 || grade > 12) {
      setError("학년은 1~12 사이로 입력해줘.");
      return;
    }
    if (classNo < 1 || classNo > 99 || studentNo < 1 || studentNo > 99) {
      setError("반과 번호는 1~99 사이로 입력해줘.");
      return;
    }
    if (!consent) {
      setError("개인정보 수집 및 이용에 동의해줘.");
      scrollToConsent();
      return;
    }

    setLoading(true);
    try {
      const res = await registerStudent({
        school: identity.school.trim(),
        grade,
        class_no: classNo,
        student_no: studentNo,
        name: name.trim(),
        password,
        consent_privacy: consent,
      });
      setAuth(res.student_token, res.student_id);
      // 백엔드가 학교/학년/반/번호/이름을 돌려주지 않으므로, 입력값을 프로필용으로 보관.
      setStudentInfo({
        school: identity.school.trim(),
        grade,
        classNo,
        studentNo,
        name: name.trim(),
      });
      router.push("/signup/photo");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // 이미 가입된 학생 → 로그인으로 유도
          setIsConflict(true);
          setError("이미 등록되어 있어요. 로그인해주세요.");
        } else if (err.status === 403) {
          // 동의 누락 (혹시 클라이언트 검증을 우회한 경우)
          setError(err.message);
          scrollToConsent();
        } else {
          setError(err.message);
        }
      } else {
        setError("알 수 없는 오류가 발생했어. 잠시 후 다시 시도해줘.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-10 font-sans">
      <CelestialBackground variant="ocean" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-md flex-col rounded-3xl border border-solid border-white/70 bg-white/80 p-8 shadow-[0_18px_45px_rgba(37,99,235,0.12)] backdrop-blur-xl"
      >
        <div className="mb-6 self-start rounded-full border border-solid border-white/70 bg-white/70 px-3 py-1 text-xs font-bold tracking-wider text-sky-700">
          회원가입
        </div>

        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-[#0d3047] md:text-4xl">
          먼저 <span className="text-aurora">너</span>를 알려줘
        </h1>
        <p className="mb-8 text-sm font-medium leading-relaxed text-[#4c6a82] md:text-base">
          행사 기록을 위해 학교 정보와 비밀번호가 필요해.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <IdentityFields
            values={identity}
            onChange={handleIdentityChange}
            disabled={loading}
          />

          <div>
            <label htmlFor="name" className={labelClass}>
              이름
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              disabled={loading}
              autoComplete="off"
              className={inputClass}
            />
          </div>

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
              autoComplete="new-password"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs font-medium text-zinc-500">
              생년월일 8자리처럼 기억하기 쉬운 숫자로 정해줘.
            </p>
          </div>

          <div
            ref={consentRef}
            className="flex items-center space-x-3 rounded-xl border border-solid border-zinc-300 bg-zinc-50 p-4"
          >
            <Checkbox
              id="privacy"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked as boolean)}
              className="border-zinc-400"
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="privacy"
                className="cursor-pointer text-sm font-bold leading-none text-zinc-700"
              >
                개인정보 수집 및 이용 동의
              </label>
              <p className="text-xs text-zinc-500">
                행사 기록 및 페르소나 분석을 위해 최소한의 정보를 수집합니다.
              </p>
            </div>
          </div>

          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-solid border-red-200 bg-red-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-red-600">{error}</p>
              {isConflict && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/login")}
                  className="mt-3 h-10 rounded-lg border-red-300 text-sm font-bold text-red-600 hover:bg-red-100"
                >
                  로그인하러 가기
                </Button>
              )}
            </motion.div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="h-14 w-full rounded-xl border border-transparent bg-gradient-to-r from-sky-500 to-blue-600 text-base font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_14px_30px_rgba(37,99,235,0.4)] active:scale-[0.98]"
          >
            {loading ? "가입하는 중..." : "다음"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm font-medium text-zinc-500">
          이미 계정이 있다면{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-bold text-sky-600 hover:text-sky-700 hover:underline"
          >
            로그인
          </button>
        </p>
      </motion.div>
    </main>
  );
}
