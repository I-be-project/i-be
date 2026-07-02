"use client";

import { motion } from "framer-motion";

// 라우트 전환 공통 진입 애니메이션 — 페이지가 넘어갈 때마다
// 아래에서 살짝 떠오르며 나타난다 (App Router의 template은 이동마다 리마운트).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex min-h-[100dvh] flex-col"
    >
      {children}
    </motion.div>
  );
}
