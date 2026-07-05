"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  devAdaptiveQuestions,
  devCoreQuestions,
  devPersonaCandidates,
  type DevPersona,
  type DevQA,
} from "@/lib/mock/devFlow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 스텝: 0 사진 → 1 Q1~6 → 2 Q7 → 3 Q8 → 4 Q9 → 5 카드 생성용 페르소나 선택(dev) → 6 결과
const ADAPTIVE_START = 2;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function QABlock({ qa, index }: { qa: DevQA; index: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">Q{index}. {qa.question}</p>
      <p className="mt-1 font-medium">{qa.answer}</p>
    </div>
  );
}

export default function DevFlowPage() {
  const [step, setStep] = useState(0);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [selected, setSelected] = useState<DevPersona | null>(null);
  const [cardBase64, setCardBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPhotoBase64(await fileToBase64(file));
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function generate(persona: DevPersona) {
    setSelected(persona);
    setStep(6);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/dev/persona-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          photo_base64: photoBase64,
          qr_data: "https://ibe.example/c/dev",
        }),
      });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const data = await res.json();
      setCardBase64(data.card_base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">페르소나 카드 생성 흐름 (dev)</h1>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-muted-foreground">증명사진을 올리면 얼굴 기반 인물 이미지를 생성합니다. (선택)</p>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50",
                )}
              >
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                {photoBase64 ? (
                  <>
                    <Image
                      src={`data:image/png;base64,${photoBase64}`}
                      alt="업로드한 사진"
                      width={112}
                      height={112}
                      unoptimized
                      className="size-28 rounded-lg object-cover"
                    />
                    <p className="text-sm text-green-600">
                      사진 준비됨 ✓ — 클릭하거나 드래그해서 교체
                    </p>
                  </>
                ) : (
                  <>
                    <ImageUp className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      여기로 사진을 드래그하거나 클릭해서 선택
                    </p>
                  </>
                )}
              </label>
              <Button onClick={() => setStep(1)}>다음</Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-muted-foreground">기본 질문 (Q1~6)</p>
              {devCoreQuestions.map((qa, i) => (
                <QABlock key={i} qa={qa} index={i + 1} />
              ))}
              <Button onClick={() => setStep(2)}>다음</Button>
            </div>
          )}

          {step >= ADAPTIVE_START && step <= 4 && (
            <div className="space-y-3">
              <p className="text-muted-foreground">적응형 질문 Q{step + 5}</p>
              <QABlock qa={devAdaptiveQuestions[step - ADAPTIVE_START]} index={step + 5} />
              <Button onClick={() => setStep(step + 1)}>다음</Button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-muted-foreground">카드 생성 테스트 — 페르소나를 골라주세요 (dev)</p>
              <div className="grid gap-3">
                {devPersonaCandidates.map((p) => (
                  <Card
                    key={p.name}
                    className="cursor-pointer transition hover:border-primary/50 hover:shadow-sm"
                    onClick={() => generate(p)}
                  >
                    <CardContent className="p-4">
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.keywords.map((k) => (
                          <Badge key={k} variant="secondary">{k}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              {loading && (
                <p className="text-muted-foreground">카드를 생성하고 있어요… (이미지 2장 생성 + 합성)</p>
              )}
              {error && (
                <div className="space-y-3">
                  <p className="text-destructive">생성 실패: {error}</p>
                  <Button variant="secondary" onClick={() => selected && generate(selected)}>
                    다시 시도
                  </Button>
                </div>
              )}
              {cardBase64 && (
                <div className="space-y-3">
                  <p className="font-semibold">{selected?.name}</p>
                  <Image
                    src={`data:image/png;base64,${cardBase64}`}
                    alt="페르소나 카드"
                    width={1536}
                    height={968}
                    unoptimized
                    className="w-full rounded-xl"
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
