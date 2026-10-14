"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFlowGuard } from "@/lib/explore/flow";
import { FlowLoading } from "@/components/voyage/FlowLoading";

// 옛 공개 대기 화면 주소. 설문·사진까지 마친 학생은 홈으로 보내고,
// 미완료 학생은 가드가 진행 중인 화면으로 되돌린다.
export default function PendingCardPage() {
  const { ready } = useFlowGuard("done");
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace("/home");
  }, [ready, router]);
  return <FlowLoading mood="night" />;
}
