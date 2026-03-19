"use client";

import { motion } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { PersonaCard } from "@/components/card/PersonaCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Compass, Ticket, BookOpen, Gift, Map } from "lucide-react";

export default function ProfilePage() {
  const persona = useSessionStore((state) => state.persona);

  // Mock data
  const badges = [
    { id: 1, name: "첫 발견", icon: Compass, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/50" },
    { id: 2, name: "얼리버드", icon: Ticket, color: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900/50" },
    { id: 3, name: "질문왕", icon: BookOpen, color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/50" },
  ];

  const boothHistory = [
    { time: "10:30 AM", name: "드론 체험존", status: "완료" },
    { time: "11:45 AM", name: "미래 직업 토크콘서트", status: "완료" },
    { time: "01:20 PM", name: "AI 디자인 연수", status: "진행중" },
  ];

  if (!persona) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">프로필 정보가 없습니다.</p>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header Profile Section */}
      <div className="bg-indigo-600 dark:bg-indigo-900 pt-16 pb-32 px-6 rounded-b-[40px] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
        <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 blur-[50px] rounded-full" />
        
        <div className="relative z-10 max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-white/20 p-1 backdrop-blur-md shadow-lg">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-indigo-100 to-white flex items-center justify-center text-indigo-700 text-3xl font-black">
              N
            </div>
          </div>
          <div className="text-center sm:text-left text-white">
            <h1 className="text-2xl font-bold mb-1">참가자 님</h1>
            <p className="text-indigo-200 font-medium opacity-90">ID: NBM-2026-X89K</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 -mt-24 relative z-20 space-y-6">
        
        {/* Card Miniature */}
        <section className="flex flex-col items-center">
          <div className="scale-75 origin-top mb-[-80px]">
            <PersonaCard persona={persona} />
          </div>
        </section>

        {/* Reward Status */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-0 shadow-md rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full" />
            <CardContent className="p-5 flex flex-col">
              <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mb-1">보유 포인트</span>
              <div className="flex items-center space-x-2">
                <Gift className="w-6 h-6 text-indigo-500" />
                <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">1,250 P</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-md rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full" />
            <CardContent className="p-5 flex flex-col">
              <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mb-1">부스 스탬프</span>
              <div className="flex items-center space-x-2">
                <Map className="w-6 h-6 text-rose-500" />
                <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">3 / 10</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Badges */}
        <Card className="border-0 shadow-md rounded-3xl bg-white dark:bg-zinc-900">
          <CardHeader className="pb-2 flex flex-row items-center space-x-2">
            <Award className="w-5 h-5 text-indigo-500" />
            <CardTitle className="text-lg">획득 배지</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide">
              {badges.map((badge) => (
                <div key={badge.id} className="flex flex-col items-center min-w-[80px]">
                  <div className={`w-16 h-16 rounded-full ${badge.bg} flex items-center justify-center mb-2 shadow-inner`}>
                    <badge.icon className={`w-8 h-8 ${badge.color}`} />
                  </div>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{badge.name}</span>
                </div>
              ))}
              <div className="flex flex-col items-center min-w-[80px] opacity-40">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 border border-dashed border-zinc-300 dark:border-zinc-700">
                  <span className="text-zinc-400 font-bold">?</span>
                </div>
                <span className="text-xs font-bold text-zinc-500">미획득</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="border-0 shadow-md rounded-3xl bg-white dark:bg-zinc-900">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">오늘의 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {boothHistory.map((booth, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">{booth.time}</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">{booth.name}</div>
                </div>
                <Badge variant={booth.status === "완료" ? "default" : "secondary"} className={booth.status === "완료" ? "bg-emerald-500" : ""}>
                  {booth.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
