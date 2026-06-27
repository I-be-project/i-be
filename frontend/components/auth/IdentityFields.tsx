"use client";

// 회원가입·로그인 공통 식별 키 입력 (학교 / 학년 / 반 / 번호).
// 백엔드 식별 키 = (school, grade, class_no, student_no).

import { Input } from "@/components/ui/input";

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

const labelClass = "mb-1.5 block text-sm font-bold text-zinc-700";
const inputClass =
  "h-12 rounded-xl border-zinc-300 bg-white px-4 text-base focus-visible:border-indigo-500";

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
      <div>
        <label htmlFor="school" className={labelClass}>
          학교
        </label>
        <Input
          id="school"
          value={values.school}
          onChange={(e) => onChange("school", e.target.value)}
          placeholder="예: 나Be중학교"
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />
      </div>

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
