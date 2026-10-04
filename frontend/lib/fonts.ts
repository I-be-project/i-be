import localFont from "next/font/local";

// 부스·홈·성장 탭 서체 — 백엔드 카드 합성(app/assets/fonts)과 같은 Paperlogy.
// 백엔드 TTF를 woff2로 변환해 app/fonts에 둔다. 탭 화면(TabPage)과 하단 탭바에 적용한다.
export const paperlogy = localFont({
  src: [
    { path: "../app/fonts/Paperlogy-4Regular.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/Paperlogy-6SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../app/fonts/Paperlogy-8ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
});
