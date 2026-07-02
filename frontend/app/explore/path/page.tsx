"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { generateStage, completeSurvey } from "@/lib/api";
import { getQ7AOptions } from "@/lib/mock/q7a";
import { Moon } from "lucide-react";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { RankSelect } from "@/components/explore/RankSelect";
import { ChipSelect } from "@/components/explore/ChipSelect";
import { NameCardSelect } from "@/components/explore/NameCardSelect";
import { GeneratingScreen } from "@/components/explore/GeneratingScreen";
import type {
  Q7BOption,
  Q8Chip,
  Q9Chip,
  NameCard,
} from "@/store/useSessionStore";

type Stage = "q7a" | "q7b" | "q8" | "q9" | "q10";
const STAGE_INDEX: Record<Stage, number> = { q7a: 7, q7b: 8, q8: 8, q9: 9, q10: 10 };

interface Q7BData {
  title: string;
  intro: string;
  options: Q7BOption[];
}
interface Q8Data {
  title: string;
  intro: string;
  student_prompt: string;
  word_chips: (Q8Chip & { why_generated_backend?: string })[];
  free_text_placeholder: string;
}
interface Q9Data {
  title: string;
  intro: string;
  student_prompt: string;
  topic_chips: Q9Chip[];
  free_text_placeholder: string;
}
interface Q10Data {
  title: string;
  intro: string;
  name_cards: (NameCard & {
    materials_used_backend?: { field?: string; career_reference?: string };
  })[];
}

export default function PathPage() {
  const router = useRouter();
  const store = useSessionStore();
  const {
    riasecScores,
    pairCode,
    answers,
    setQ7aSelection,
    setQ7bSelection,
    setQ8Selection,
    setQ9Selection,
    setQ10Selection,
    setPersona,
  } = store;

  const [stage, setStage] = useState<Stage>("q7a");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계별 생성 데이터
  const [q7bData, setQ7bData] = useState<Q7BData | null>(null);
  const [q8Data, setQ8Data] = useState<Q8Data | null>(null);
  const [q9Data, setQ9Data] = useState<Q9Data | null>(null);
  const [q10Data, setQ10Data] = useState<Q10Data | null>(null);

  // 진행 중 선택 상태
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [nameId, setNameId] = useState<string | null>(null);

  // pairCode 없으면 비정상 진입 — 처음으로
  useEffect(() => {
    if (!pairCode || !riasecScores) router.replace("/explore");
  }, [pairCode, riasecScores, router]);

  // 다음 단계로 넘어가면 맨 위부터 다시 보이게
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage]);

  const q1to6 = answers
    .map((a) => a.value)
    .filter((v): v is string => typeof v === "string");

  // 공통: 생성 호출. 마지막 호출 입력을 보관해 "다시 시도"에 재사용.
  const lastReq = useRef<{ stage: string; body: unknown } | null>(null);
  // 생성이 아닌 단계(완료 저장 등)의 "다시 시도" 핸들러. 설정돼 있으면 retry가 이걸 우선 실행.
  const pendingRetry = useRef<(() => void) | null>(null);
  const callGenerate = useCallback(
    async (
      apiStage: "q7b" | "q8" | "q9" | "q10",
      body: unknown,
      onOk: (data: unknown) => void,
    ) => {
      lastReq.current = { stage: apiStage, body };
      pendingRetry.current = null; // 생성 흐름으로 진입하면 저장 재시도는 무효화
      setGenerating(true);
      setError(null);
      try {
        const json = await generateStage(apiStage, body as Record<string, unknown>);
        onOk(json);
      } catch {
        setError("생성에 실패했어요. 다시 시도해주세요.");
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const resetSelection = () => {
    setFirst(null);
    setSecond(null);
    setChipIds([]);
    setFreeText("");
    setNameId(null);
  };

  const baseInput = {
    riasecScores: riasecScores ?? {},
    pairCode: pairCode ?? "",
    q1to6,
  };

  // Q7-A 확정 → Q7-B 생성
  const submitQ7a = () => {
    const opts = getQ7AOptions(pairCode ?? "");
    const firstOpt = opts.find((o) => o.id === first)!;
    const secondOpt = opts.find((o) => o.id === second)!;
    setQ7aSelection({ first: firstOpt, second: secondOpt });
    callGenerate(
      "q7b",
      { ...baseInput, q7aFirst: firstOpt.label, q7aSecond: secondOpt.label },
      (json) => {
        setQ7bData((json as { q7b: Q7BData }).q7b);
        resetSelection();
        setStage("q7b");
      },
    );
  };

  // Q7-B 확정 → Q8 생성
  const submitQ7b = () => {
    if (!q7bData) return;
    const firstOpt = q7bData.options.find((o) => o.subfield_id === first)!;
    const secondOpt = q7bData.options.find((o) => o.subfield_id === second)!;
    setQ7bSelection({ first: firstOpt, second: secondOpt });
    const a = store.q7aSelection;
    callGenerate(
      "q8",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: firstOpt,
        q7bSecond: secondOpt,
      },
      (json) => {
        setQ8Data((json as { q8: Q8Data }).q8);
        resetSelection();
        setStage("q8");
      },
    );
  };

  // Q8 확정 → Q9 생성
  const submitQ8 = () => {
    if (!q8Data) return;
    const chips = q8Data.word_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ8Selection({ chips, freeText });
    const a = store.q7aSelection;
    const b = store.q7bSelection;
    callGenerate(
      "q9",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: b?.first,
        q7bSecond: b?.second,
        q8: { chips, freeText },
      },
      (json) => {
        setQ9Data((json as { q9: Q9Data }).q9);
        resetSelection();
        setStage("q9");
      },
    );
  };

  // Q9 확정 → Q10 생성
  const submitQ9 = () => {
    if (!q9Data) return;
    const chips = q9Data.topic_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ9Selection({ chips, freeText });
    const a = store.q7aSelection;
    const b = store.q7bSelection;
    const careerPool = [
      ...(b?.first.career_pool ?? []),
      ...(b?.second.career_pool ?? []),
    ];
    callGenerate(
      "q10",
      {
        ...baseInput,
        q7aFirst: a?.first.label ?? "",
        q7aSecond: a?.second.label ?? "",
        q7bFirst: b?.first,
        q7bSecond: b?.second,
        q8: store.q8Selection,
        q9: { chips, freeText },
        careerPool,
      },
      (json) => {
        setQ10Data((json as { q10: Q10Data }).q10);
        resetSelection();
        setStage("q10");
      },
    );
  };

  // Q10 확정 → persona 매핑 → 백엔드 완료 저장 → 결과로
  const submitQ10 = async () => {
    if (!q10Data || !nameId) return;
    const card = q10Data.name_cards.find((c) => c.name_id === nameId)!;
    setQ10Selection(card);
    const b = store.q7bSelection;
    const keywords = [
      ...(store.q8Selection?.chips.map((c) => c.text) ?? []),
      ...(store.q9Selection?.chips.map((c) => c.text) ?? []),
    ].slice(0, 5);
    const fields = [card.materials_used_backend?.field ?? pairCode ?? ""].filter(Boolean);
    setPersona({
      name: card.persona_name,
      tagline: card.short_description,
      keywords,
      fields,
      recommendedBooths: [
        ...(b?.first.career_pool ?? []),
        ...(b?.second.career_pool ?? []),
      ].slice(0, 3),
    });

    // 완료 저장은 인증 필요. 토큰 없으면 로그인으로.
    if (!store.studentToken) {
      router.push("/login");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await completeSurvey(store.studentToken, {
        name: card.persona_name,
        tagline: card.short_description,
        keywords,
        fields,
      });
      router.push("/explore/interpreting");
    } catch {
      pendingRetry.current = submitQ10; // "다시 시도" 시 저장을 재실행
      setError("결과 저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  };

  // "다시 시도" — 저장 재시도 핸들러가 있으면 우선, 없으면 마지막 생성 요청 재실행
  const retry = () => {
    if (pendingRetry.current) {
      const fn = pendingRetry.current;
      pendingRetry.current = null;
      fn();
      return;
    }
    const req = lastReq.current;
    if (!req) return;
    const apiStage = req.stage as "q7b" | "q8" | "q9" | "q10";
    const onOkMap = {
      q7b: (json: unknown) => {
        setQ7bData((json as { q7b: Q7BData }).q7b);
        resetSelection();
        setStage("q7b");
      },
      q8: (json: unknown) => {
        setQ8Data((json as { q8: Q8Data }).q8);
        resetSelection();
        setStage("q8");
      },
      q9: (json: unknown) => {
        setQ9Data((json as { q9: Q9Data }).q9);
        resetSelection();
        setStage("q9");
      },
      q10: (json: unknown) => {
        setQ10Data((json as { q10: Q10Data }).q10);
        resetSelection();
        setStage("q10");
      },
    };
    callGenerate(apiStage, req.body, onOkMap[apiStage]);
  };

  const toggleChip = (id: string) =>
    setChipIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 2
          ? prev // 최대 2개
          : [...prev, id],
    );

  if (!pairCode || !riasecScores) return null;

  // 현재 단계의 제목/본문/하단버튼 구성
  const rankReady = first !== null && second !== null;
  const chipReady = chipIds.length > 0 || freeText.trim().length > 0;

  const q7aOptions = getQ7AOptions(pairCode);

  let title = "";
  let body: ReactNode = null;
  let cta = "";
  let onCta: () => void = () => {};
  let ctaDisabled = false;

  if (stage === "q7a") {
    title = "섬을 둘러보다 마주친 장소들이에요. 더 가보고 싶은 곳을 1·2순위로 골라주세요.";
    body = (
      <RankSelect
        options={q7aOptions}
        first={first}
        second={second}
        onChange={(f, s) => {
          setFirst(f);
          setSecond(s);
        }}
      />
    );
    cta = "이 곳으로 가보기";
    onCta = submitQ7a;
    ctaDisabled = !rankReady;
  } else if (stage === "q7b" && q7bData) {
    title = q7bData.title;
    body = (
      <RankSelect
        options={q7bData.options.map((o) => ({
          id: o.subfield_id,
          label: o.student_title,
          description: o.student_description,
        }))}
        first={first}
        second={second}
        onChange={(f, s) => {
          setFirst(f);
          setSecond(s);
        }}
      />
    );
    cta = "이 길로 들어가기";
    onCta = submitQ7b;
    ctaDisabled = !rankReady;
  } else if (stage === "q8" && q8Data) {
    title = q8Data.title;
    body = (
      <ChipSelect
        chips={q8Data.word_chips.map((c) => ({ id: c.chip_id, text: c.text }))}
        selectedIds={chipIds}
        freeText={freeText}
        placeholder={q8Data.free_text_placeholder}
        onToggle={toggleChip}
        onFreeText={setFreeText}
      />
    );
    cta = "다음";
    onCta = submitQ8;
    ctaDisabled = !chipReady;
  } else if (stage === "q9" && q9Data) {
    title = q9Data.title;
    body = (
      <ChipSelect
        chips={q9Data.topic_chips.map((c) => ({ id: c.chip_id, text: c.text }))}
        selectedIds={chipIds}
        freeText={freeText}
        placeholder={q9Data.free_text_placeholder}
        onToggle={toggleChip}
        onFreeText={setFreeText}
      />
    );
    cta = "다음";
    onCta = submitQ9;
    ctaDisabled = !chipReady;
  } else if (stage === "q10" && q10Data) {
    title = q10Data.title;
    body = (
      <NameCardSelect
        cards={q10Data.name_cards.map((c) => ({
          id: c.name_id,
          name: c.persona_name,
          description: c.short_description,
          emphasis: c.emphasis,
        }))}
        selectedId={nameId}
        onSelect={setNameId}
      />
    );
    cta = "이 이름으로 결정하기";
    onCta = submitQ10;
    ctaDisabled = nameId === null;
  }

  const showGenerating = generating || error !== null;

  return (
    // overflow-hidden은 배경 컴포넌트가 자체 처리 — main에 걸면 sticky CTA가 죽는다
    <main className="relative flex min-h-[100dvh] flex-col font-sans">
      {/* Q6 해질녘 신호 이후 — 밤이 깊어진 섬에서 심화 탐험이 이어진다 */}
      <ExpeditionBackdrop mood="night" />
      <TrailBar step={STAGE_INDEX[stage]} total={10} />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-grow flex-col px-6 pb-8 pt-7">
        {showGenerating ? (
          <GeneratingScreen error={error} onRetry={retry} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="flex flex-grow flex-col"
            >
              {/* 컴팩트 진행 칩 — 진행 헤더 블록 대신 한 줄로 */}
              <div className="mb-4 flex items-center justify-between">
                <div className="glass-card inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-ink">
                  <Moon className="h-3 w-3 text-sky-600" />
                  밤의 심화 탐험
                </div>
                <div className="glass-card rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
                  {STAGE_INDEX[stage]}/10
                </div>
              </div>

              <h2 className="mb-7 break-keep text-2xl font-extrabold leading-snug text-ink">
                {title}
              </h2>
              <div className="flex-grow pb-32">{body}</div>
              <div className="sticky bottom-0 z-10 -mx-6 flex justify-center bg-gradient-to-t from-sand via-sand/80 to-transparent p-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <CtaButton
                  onClick={onCta}
                  disabled={ctaDisabled}
                  className="max-w-md"
                >
                  {cta}
                </CtaButton>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}
