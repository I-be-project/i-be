"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSessionStore, InputMode } from "@/store/useSessionStore";
import { MessageCircle, Image as ImageIcon, BoxSelect, Gamepad2 } from "lucide-react";

const inputModes = [
  {
    id: "chat",
    title: "말로 답하기",
    description: "생각나는 대로 자유롭게 적어보세요",
    icon: MessageCircle,
    color: "from-blue-500 to-cyan-500",
    bgLight: "bg-blue-50",
    textColor: "text-blue-600",
  },
  {
    id: "image",
    title: "이미지 고르기",
    description: "끌리는 사진을 골라보세요",
    icon: ImageIcon,
    color: "from-purple-500 to-pink-500",
    bgLight: "bg-purple-50",
    textColor: "text-purple-600",
  },
  {
    id: "word",
    title: "단어 고르기",
    description: "나를 잘 표현하는 단어는?",
    icon: BoxSelect,
    color: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50",
    textColor: "text-emerald-600",
  },
  {
    id: "game",
    title: "미니 게임형",
    description: "재미있게 두 가지 중 골라봐요",
    icon: Gamepad2,
    color: "from-orange-500 to-rose-500",
    bgLight: "bg-orange-50",
    textColor: "text-orange-600",
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
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-white font-sans">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 mt-10"
      >
        <div className="inline-block mb-3 px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-bold tracking-wider border border-solid border-zinc-300">
          STEP 01
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 mb-3">
          어떤 방식으로 탐색할까요?
        </h1>
        <p className="text-zinc-500 font-medium">
          나를 가장 잘 표현할 수 있는 방식을 선택해주세요.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl px-4"
      >
        {inputModes.map((mode) => (
          <motion.div key={mode.id} variants={itemVariants}>
            <div
              className={`group relative overflow-hidden cursor-pointer h-full border-2 border-solid border-zinc-300 bg-white hover:border-indigo-400 transition-all hover:shadow-[0_4px_20px_rgb(0,0,0,0.05)] hover:-translate-y-1 p-6 rounded-2xl`}
              onClick={() => handleSelectMode(mode.id as InputMode)}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-2xl ${mode.bgLight} transition-colors border border-solid border-white/50`}>
                  <mode.icon className={`w-6 h-6 ${mode.textColor} group-hover:scale-110 transition-transform`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1 transition-all">
                    {mode.title}
                  </h3>
                  <p className="text-sm text-zinc-500 font-medium">
                    {mode.description}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </main>
  );
}
