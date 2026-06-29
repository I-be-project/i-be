"use client";

// 회원가입·로그인 공통 식별 키 입력 (학교 / 학년 / 반 / 번호).
// 백엔드 식별 키 = (school, grade, class_no, student_no).

import { Input } from "@/components/ui/input";
import { SchoolSelect } from "@/components/auth/SchoolSelect";

export interface IdentityValues {
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
  "h-13 rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none focus-visible:border-indigo-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100";

// 숫자 입력란은 숫자만 허용 (식별 키 학년/반/번호).
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function IdentityFields({
  values,
  onChange,
  disabled,
}: IdentityFieldsProps) {
  return (
    <div className="space-y-4">
      <SchoolSelect
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
    </div>
  );
}
