"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
    <main className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 pb-24">
      <div className="w-full h-[40vh] relative flex flex-col items-center justify-end pb-8 px-6 bg-gradient-to-br from-indigo-500 via-purple-600 to-fuchsia-600 overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-white/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-48 h-48 bg-purple-900/40 blur-[80px] rounded-full" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: "spring" }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <div className="mb-4 inline-flex items-center space-x-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 shadow-xl">
            <Star className="w-4 h-4 text-yellow-300" fill="currentColor" />
            <span className="text-white text-sm font-semibold tracking-wide">분석 완료</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight">
            {persona.name}
          </h1>
          <p className="text-lg md:text-xl text-indigo-50 font-medium max-w-lg drop-shadow-md">
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
        <Card className="border-0 shadow-lg rounded-3xl overflow-hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl">
          <CardContent className="p-8">
            <h3 className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">
              핵심 키워드
            </h3>
            <div className="flex flex-wrap gap-2 mb-8">
              {persona.keywords.map((kw, i) => (
                <motion.div variants={fadeInVariants} key={i}>
                  <Badge variant="secondary" className="px-4 py-1.5 text-sm bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors">
                    #{kw}
                  </Badge>
                </motion.div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <motion.div variants={fadeInVariants}>
                <div className="flex items-center space-x-2 mb-3">
                  <LayoutGrid className="w-5 h-5 text-purple-500" />
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100">관련 분야</h4>
                </div>
                <div className="space-y-2">
                  {persona.fields.map((field) => (
                    <div key={field} className="flex items-center space-x-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{field}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={fadeInVariants}>
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="w-5 h-5 text-rose-500" />
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100">추천 체험 부스</h4>
                </div>
                <div className="space-y-2">
                  {persona.recommendedBooths.map((booth) => (
                    <div key={booth} className="flex items-center space-x-3 p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{booth}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent dark:from-zinc-950 dark:via-zinc-950 z-30 flex justify-center pointer-events-none">
        <Button
          size="lg"
          onClick={() => router.push("/explore/card")}
          className="w-full max-w-3xl h-14 rounded-xl text-lg font-bold shadow-[0_8px_30px_rgba(99,102,241,0.3)] bg-indigo-600 hover:bg-indigo-700 text-white transition-all pointer-events-auto"
        >
          내 페르소나 카드 발급하기
        </Button>
      </div>
    </main>
  );
}
