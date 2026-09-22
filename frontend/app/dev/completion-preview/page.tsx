import Image from "next/image";
import { notFound } from "next/navigation";
import { CompletionEditDialog } from "@/components/explore/CompletionEditDialog";

export default function CompletionPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="flex min-h-dvh justify-center bg-[#c9e5fa] font-sans">
      <div className="relative flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center overflow-hidden bg-[url('/bg-hanmadang.webp')] bg-cover bg-center px-6 py-10 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/15 to-white/75" />
        <div className="relative flex flex-col items-center">
          <h1 className="text-[1.9rem] font-black leading-tight text-ink">탐험대원증이<br />만들어지고 있어</h1>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-ink-soft">탐험 설문은 끝났어.<br />카드 모습만 공개를 기다리는 중이야.</p>
          <Image src="/card.png" alt="공개 대기 중인 탐험대원증" width={340} height={348} className="my-6 h-auto w-[min(74vw,340px)]" />
          <p className="text-[22px] font-black text-ink">나Be한마당 <span className="text-amber-600">행사 당일</span> 공개</p>
          <p className="mt-5 text-sm text-ink-soft">팝업을 다시 보려면 새로고침해 주세요.</p>
        </div>
        <CompletionEditDialog preview />
      </div>
    </main>
  );
}
