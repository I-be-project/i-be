"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSessionStore, InputMode } from "@/store/useSessionStore";
import { Card } from "@/components/ui/card";
import { MessageCircle, Image as ImageIcon, BoxSelect, Gamepad2 } from "lucide-react";

const inputModes = [
  {
    id: "chat",
    title: "말로 답하기",
    description: "생각나는 대로 자유롭게 적어보세요",
    icon: MessageCircle,
    color: "from-blue-500 to-cyan-500",
    bgLight: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "image",
    title: "이미지 고르기",
    description: "끌리는 사진을 골라보세요",
    icon: ImageIcon,
    color: "from-purple-500 to-pink-500",
    bgLight: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    id: "word",
    title: "단어 고르기",
    description: "나를 잘 표현하는 단어는?",
    icon: BoxSelect,
    color: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    id: "game",
    title: "미니 게임형",
    description: "재미있게 두 가지 중 골라봐요",
    icon: Gamepad2,
    color: "from-orange-500 to-rose-500",
    bgLight: "bg-orange-50 dark:bg-orange-950/30",
  },
] as const;

const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

export default function ExplorePage() {
  const router = useRouter();
  const setInputMode = useSessionStore((state) => state.setInputMode);

  const handleSelectMode = (mode: InputMode) => {
    setInputMode(mode);
    router.push("/explore/questions");
  };

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="inline-block mb-3 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold tracking-wider">
          STEP 01
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
          어떤 방식으로 탐색할까요?
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          나를 가장 잘 표현할 수 있는 방식을 선택해주세요.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl"
      >
        {inputModes.map((mode) => (
          <motion.div key={mode.id} variants={itemVariants}>
            <Card
              className={`group relative overflow-hidden cursor-pointer h-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-transparent transition-all hover:shadow-xl hover:-translate-y-1 p-6`}
              onClick={() => handleSelectMode(mode.id as InputMode)}
            >
              {/* Animated gradient border simulation on hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${mode.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}
              />
              
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-2xl ${mode.bgLight} transition-colors`}>
                  <mode.icon className={`w-6 h-6 text-zinc-700 dark:text-zinc-300 group-hover:scale-110 transition-transform`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-zinc-900 group-hover:to-zinc-600 dark:group-hover:from-white dark:group-hover:to-zinc-300 transition-all">
                    {mode.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {mode.description}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </main>
  );
}
