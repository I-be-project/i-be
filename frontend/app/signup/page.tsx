"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IdentityFields, type IdentityValues } from "@/components/auth/IdentityFields";
import { useSessionStore } from "@/store/useSessionStore";
import { ApiError, registerStudent } from "@/lib/api";
import { VoyageBackground } from "@/components/voyage/VoyageBackground";
import { CtaButton } from "@/components/voyage/CtaButton";

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-sky-100";

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useSessionStore((state) => state.setAuth);
  const setStudentInfo = useSessionStore((state) => state.setStudentInfo);

  const [identity, setIdentity] = useState<IdentityValues>({
    level: "중학교",
    school: "",
    grade: "",
    classNo: "",
    studentNo: "",
  });
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      !gender ||
      !password ||
      !confirmPassword
    ) {
      setError("모든 항목을 입력해줘.");
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      setError("비밀번호는 숫자 4자리로 정해줘.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 서로 달라. 다시 확인해줘.");
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
        gender,
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
        gender,
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
          탐험대 등록 · 1/2
        </p>
        <h1 className="text-[2rem] font-black leading-[1.2] tracking-tight text-ink">
          탐험대원
          <br />
          명단에 올려줘
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-ink-muted">
          나로섬에 도착하면, 네 이름이 탐험대 명단에 새겨져.   탐험이 끝나면 이 기록이 탐험대원증이 돼.
        </p>
      </div>

      {/* 바텀 시트 — 앱처럼 아래에서 올라오는 흰 면 */}
      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 mt-auto flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-8 pt-7 shadow-[0_-12px_40px_rgba(37,99,235,0.12)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col" noValidate>
          <div className="space-y-5">
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
              <span className={labelClass}>성별</span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="성별">
                {(
                  [
                    { value: "male", label: "남" },
                    { value: "female", label: "여" },
                  ] as const
                ).map((opt) => {
                  const selected = gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(opt.value)}
                      disabled={loading}
                      aria-pressed={selected}
                      className={
                        "h-13 rounded-2xl border text-base font-bold transition-colors disabled:opacity-60 " +
                        (selected
                          ? "border-sky-400 bg-sky-50 text-sky-700 ring-4 ring-sky-100"
                          : "border-transparent bg-zinc-100 text-zinc-500 hover:bg-zinc-200")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="생일 4자리 (예: 1029)"
                disabled={loading}
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs font-medium text-zinc-500">
                생일 4자리나 전화번호 뒷자리처럼 기억하기 쉬운 숫자로 정해줘
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelClass}>
                비밀번호 확인
              </label>
              <Input
                id="confirmPassword"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="비밀번호를 한 번 더 입력해줘"
                disabled={loading}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div
              ref={consentRef}
              className="flex items-center space-x-3 rounded-2xl border border-solid border-sky-100 bg-sky-50 p-4"
            >
              <Checkbox
                id="privacy"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked as boolean)}
                className="border-sky-300"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="privacy"
                  className="cursor-pointer text-sm font-bold leading-none text-ink-soft"
                >
                  개인정보 수집 및 이용 동의
                </label>
                <p className="text-xs text-ink-muted">
                  행사 기록 및 탐험대원증 발급을 위해 최소한의 정보를 수집합니다
                </p>
              </div>
            </div>

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-solid border-red-200 bg-red-50 px-4 py-3"
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
          </div>

          {/* 하단 고정 액션 */}
          <div className="mt-auto pt-8">
            <CtaButton type="submit" disabled={loading}>
              {loading ? "명단에 올리는 중..." : "다음"}
            </CtaButton>

            <p className="mt-5 text-center text-sm font-medium text-zinc-500">
              이미 등록한 탐험대원이라면{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-bold text-sky-600 hover:underline"
              >
                로그인
              </button>
            </p>
          </div>
        </form>
      </motion.section>
    </main>
  );
}
