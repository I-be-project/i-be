import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionHydrator } from "@/components/SessionHydrator";
import "./globals.css";

export const metadata: Metadata = {
  title: "나Be한마당 페르소나 카드",
  description: "너는 어떤 미래를 살아보고 싶니?",
};

// 다이나믹 아일랜드/상태바 영역이 흰색으로 뜨지 않도록 상단창 배경색을 지정.
// viewportFit: "cover" 로 노치/세이프에어리어까지 배경을 채운다.
// 초기 기본색은 하늘 무드 상단(#c9e5fa) — 원정 씬에서는 화면별로 동적 갱신된다.
export const viewport: Viewport = {
  themeColor: "#c9e5fa",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <SessionHydrator />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
