import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 백엔드 저장 값('male'/'female')을 화면 표기('남'/'여')로 변환.
// 과거 가입자 등 값이 없으면 "-".
export function genderLabel(gender: string | null | undefined): string {
  if (gender === "male") return "남";
  if (gender === "female") return "여";
  return "-";
}
