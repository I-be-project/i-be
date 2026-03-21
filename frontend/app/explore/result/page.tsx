"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, LayoutGrid, MapPin } from "lucide-react";

const fadeInVariants: any = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerVariants: any = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function ResultPage() {
  const router = useRouter();
  const persona = useSessionStore((state) => state.persona);

  useEffect(() => {
    if (!persona) {
      router.replace("/explore");
    }
  }, [persona, router]);

  if (!persona) return null;

  return (
    <main className="min-h-[100dvh] bg-white pb-24 font-sans">
      <div className="w-full h-[40vh] relative flex flex-col items-center justify-end pb-12 px-6 bg-white border-b-2 border-solid border-zinc-300">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: "spring" }}
          className="relative z-10 flex flex-col items-center text-center w-full max-w-3xl"
        >
          <div className="mb-4 inline-flex items-center space-x-2 bg-zinc-50 px-4 py-1.5 rounded-full border border-solid border-zinc-300">
            <Star className="w-4 h-4 text-indigo-500" fill="currentColor" />
            <span className="text-zinc-700 text-sm font-bold tracking-wide">분석 완료</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 mb-4 leading-tight">
            {persona.name}
          </h1>
          <p className="text-lg md:text-xl text-zinc-600 font-medium max-w-lg mb-4">
            "{persona.tagline}"
          </p>
        </motion.div>
      </div>

      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-3xl mx-auto px-6 -mt-8 relative z-20 space-y-6"
      >
        <Card className="shadow-sm rounded-3xl overflow-hidden bg-white border-2 border-solid border-zinc-300">
          <CardContent className="p-8">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
              핵심 키워드
            </h3>
            <div className="flex flex-wrap gap-2 mb-8">
              {persona.keywords.map((kw, i) => (
                <motion.div variants={fadeInVariants} key={i}>
                  <Badge variant="secondary" className="px-4 py-1.5 text-sm font-bold bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors border-none">
                    #{kw}
                  </Badge>
                </motion.div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <motion.div variants={fadeInVariants}>
                <div className="flex items-center space-x-2 mb-3">
                  <LayoutGrid className="w-5 h-5 text-indigo-500" />
                  <h4 className="font-bold text-zinc-900">관련 분야</h4>
                </div>
                <div className="space-y-2 flex flex-col">
                  {persona.fields.map((field) => (
                    <div key={field} className="flex items-center space-x-3 p-3 rounded-xl bg-zinc-50 border border-solid border-zinc-300">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span className="text-sm font-bold text-zinc-700">{field}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={fadeInVariants}>
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="w-5 h-5 text-rose-500" />
                  <h4 className="font-bold text-zinc-900">추천 체험 부스</h4>
                </div>
                <div className="space-y-2 flex flex-col">
                  {persona.recommendedBooths.map((booth) => (
                    <div key={booth} className="flex items-center space-x-3 p-3 rounded-xl bg-zinc-50 border border-solid border-zinc-300">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-sm font-bold text-zinc-700">{booth}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent z-30 flex justify-center pointer-events-none pb-8">
        <Button
          size="lg"
          onClick={() => router.push("/explore/card")}
          className="w-full max-w-3xl h-14 rounded-2xl text-lg font-bold shadow-none bg-indigo-600 hover:bg-indigo-700 text-white border border-transparent transition-all pointer-events-auto"
        >
          내 페르소나 카드 발급하기
        </Button>
      </div>
    </main>
  );
}
