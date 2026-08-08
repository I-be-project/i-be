"use client";

// 회원가입·로그인 공통 식별 입력.
// 학교 소속(중학교/고등학교)은 (school, grade, class_no, student_no)로 식별하고,
// 개인 참여자는 학교 정보 없이 이름 + 비밀번호로 식별한다(백엔드 kind='guest').

import { Input } from "@/components/ui/input";
import { SchoolSelect } from "@/components/auth/SchoolSelect";
import { cn } from "@/lib/utils";

export type IdentityLevel = "중학교" | "고등학교" | "개인";

const LEVELS: IdentityLevel[] = ["중학교", "고등학교", "개인"];

export interface IdentityValues {
  level: IdentityLevel;
  school: string;
  grade: string;
  classNo: string;
  studentNo: string;
}

interface IdentityFieldsProps {
  values: IdentityValues;
  onChange: (field: keyof IdentityValues, value: string) => void;
  disabled?: boolean;
}

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-600";
const inputClass =
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-sky-100";

// 숫자 입력란은 숫자만 허용 (식별 키 학년/반/번호).
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** 학교 정보를 쓰지 않는 참여 유형인지. 백엔드로 학교 4개 필드를 보내지 않는다. */
export function isGuestLevel(level: IdentityLevel): level is "개인" {
  return level === "개인";
}

// 학교명 접미사로 학교급을 복원 (예: "…고등학교" → 고등학교).
function deriveLevel(name: string): "중학교" | "고등학교" {
  return name.endsWith("고등학교") ? "고등학교" : "중학교";
}

export function IdentityFields({ values, onChange, disabled }: IdentityFieldsProps) {
  const handleLevelChange = (next: IdentityLevel) => {
    if (next === values.level) return;
    onChange("level", next);

    if (!values.school) return;
    // "개인"은 학교를 쓰지 않으니 항상 비운다. 중학교↔고등학교 전환은 선택된 학교가
    // 새 학교급에 속하지 않을 때만 비운다(예: 나로중학교 선택 후 고등학교로 전환).
    if (next === "개인" || deriveLevel(values.school) !== next) {
      onChange("school", "");
    }
  };

  return (
    <div className="space-y-4">
      {/* 참여 유형 탭 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-600">참여 유형</span>
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              disabled={disabled}
              onClick={() => handleLevelChange(lv)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                values.level === lv
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-200"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {isGuestLevel(values.level) ? (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-medium leading-relaxed text-zinc-500">
          학교에 속하지 않은 참가자야. 이름과 비밀번호로 참여할 수 있어.
        </p>
      ) : (
        <>
          <SchoolSelect
            level={values.level}
            value={values.school}
            onChange={(school) => onChange("school", school)}
            disabled={disabled}
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="grade" className={labelClass}>
                학년
              </label>
              <Input
                id="grade"
                value={values.grade}
                onChange={(e) => onChange("grade", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="1"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="classNo" className={labelClass}>
                반
              </label>
              <Input
                id="classNo"
                value={values.classNo}
                onChange={(e) => onChange("classNo", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="3"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="studentNo" className={labelClass}>
                번호
              </label>
              <Input
                id="studentNo"
                value={values.studentNo}
                onChange={(e) => onChange("studentNo", digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="11"
                maxLength={2}
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
