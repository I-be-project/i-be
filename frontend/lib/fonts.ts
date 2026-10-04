import { Black_Han_Sans } from "next/font/google";

// 성장 탭의 큰 숫자·제목용 디스플레이 서체. 본문은 전역 Pretendard 그대로.
// 한글 글리프는 unicode-range로 나뉘어 있어 latin만 preload하면 의미가 없다 — preload를 끈다.
export const displayFont = Black_Han_Sans({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
