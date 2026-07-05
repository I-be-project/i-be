"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useFlowGuard, useBlockBack } from "@/lib/explore/flow";
import { FlowLoading } from "@/components/voyage/FlowLoading";

const SUPPORT_EMAIL = "ibesupport.2026@gmail.com";

// 공개 대기함 — Q9까지 응답을 마치면 도착하는 종료 화면.
// 탐험대원증 이름·카드는 한마당에서 공개하므로, 여기서는 "만들어지는 중"만 보여준다.
export default function PendingCardPage() {
  // 종료 화면 — 완료하지 않았으면 진행 화면으로 되돌리고, 완료 후엔 뒤로가기를 막는다.
  const { ready } = useFlowGuard("done");
  useBlockBack();

  // 문의 이메일 복사 — 탭하면 클립보드에 담고 잠시 "복사됨"을 표시한다.
  const [copied, setCopied] = useState(false);
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드 접근 불가 시 무시 */
    }
  };

  if (!ready) return <FlowLoading mood="night" />;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-12 font-sans">
      {/* 배경 — 나로섬 한마당 전경(해질녘 광장). 앱 프레임(main) 안에 갇힘. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-hanmadang.webp')" }}
      />
      {/* 가독성 스크림 — 위/아래를 살짝 밝게 눌러 글자가 뜨게 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/15 to-white/75"
      />
      {/* 카드에서 번져 나오는 따뜻한 금빛 스포트라이트 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,206,110,0.5),rgba(255,206,110,0)_48%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-md flex-col items-center text-center"
      >
        <h1 className="mb-3 break-keep text-[1.9rem] font-black leading-tight tracking-tight text-ink [text-shadow:0_1px_16px_rgba(255,255,255,0.7)]">
          탐험대원증이
          <br />
          만들어지고 있어
        </h1>
        <p className="max-w-xs break-keep text-[14.5px] font-semibold leading-relaxed text-ink-soft [text-shadow:0_1px_10px_rgba(255,255,255,0.7)]">
          탐험 설문은 끝났어. 네가 고른 이름과 이야기는 이미 정리됐고, 카드
          모습만 공개를 기다리는 중이야.
        </p>

        {/* 아직 공개되지 않은 탐험대원증 — 숨쉬듯 빛나는 봉인된 황금 물음표 카드 */}
        <div className="relative my-10 flex h-[26rem] w-full items-center justify-center">
          {/* 뒤에서 번지는 금빛 광채 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-80 w-80 rounded-full bg-amber-300/30 blur-3xl"
              animate={{
                scale: [0.85, 1.2, 0.85],
                opacity: [0.35, 0.75, 0.35],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* 숨쉬는 듯한 scale 펄스 */}
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image
              src="/card.png"
              alt="공개 대기 중인 탐험대원증"
              width={1000}
              height={1024}
              priority
              draggable={false}
              className="h-auto w-[min(74vw,27rem)] select-none"
            />
          </motion.div>
        </div>

        <div className="w-full max-w-sm text-center [&_*]:[text-shadow:0_1px_10px_rgba(255,255,255,0.85)]">
          {/* 공개 시점 */}
          <p className="text-[22px] font-black leading-snug tracking-tight text-ink">
            나Be한마당 <span className="text-amber-600">행사 당일</span> 공개
          </p>

          {/* 문의 */}
          <p className="mx-auto mt-3 max-w-[19rem] break-keep text-[16px] font-semibold leading-relaxed text-ink-soft">
            다시 참여하고 싶거나, 오류·입력 실수, 궁금한 점이 있으면 아래 메일로
            연락해 줘.
          </p>

          <button
            type="button"
            onClick={copyEmail}
            className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-ink/25 px-5 py-2.5 transition hover:border-ink/45 active:scale-[0.97] [&_*]:[text-shadow:none]"
          >
            <span className="text-[16px] font-bold text-ink">
              {SUPPORT_EMAIL}
            </span>
            {copied ? (
              <Check
                className="h-[18px] w-[18px] text-amber-600"
                strokeWidth={2.8}
              />
            ) : (
              <Copy
                className="h-[18px] w-[18px] text-ink-muted"
                strokeWidth={2.4}
              />
            )}
          </button>
        </div>
      </motion.div>
    </main>
  );
}
