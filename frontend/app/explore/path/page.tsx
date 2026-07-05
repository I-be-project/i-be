"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/useSessionStore";
import { generateStage, completeSurvey, saveAnswer } from "@/lib/api";
import type { AnswerStage } from "@/lib/api";
import { getQ7AOptions } from "@/lib/mock/q7a";
import { Moon } from "lucide-react";
import { ExpeditionBackdrop } from "@/components/voyage/ExpeditionScene";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { RankSelect } from "@/components/explore/RankSelect";
import { ChipSelect } from "@/components/explore/ChipSelect";
import { GeneratingScreen } from "@/components/explore/GeneratingScreen";
import type { GeneratingStage } from "@/lib/assets/sceneManifest";
import type { Q7BOption, Q8Chip, Q9Chip } from "@/store/useSessionStore";
import { useFlowGuard, useBlockBack } from "@/lib/explore/flow";

// 별빛 프로그램은 Q9가 마지막 — 응답을 마치면 세션을 완료하고 공개 대기로 간다.
type Stage = "q7a" | "q7b" | "q8" | "q9";
const STAGE_INDEX: Record<Stage, number> = { q7a: 7, q7b: 8, q8: 8, q9: 9 };

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

export default function PathPage() {
  const router = useRouter();
  // 밤 프로그램(Q7~9) — 여기부터는 뒤로가기를 막고, 재진입 시 완료한 질문 다음 단계로 이어간다.
  const { ready } = useFlowGuard("path");
  useBlockBack();

  const store = useSessionStore();
  const {
    riasecScores,
    pairCode,
    answers,
    setQ7aSelection,
    setQ7bSelection,
    setQ8Selection,
    setQ9Selection,
  } = store;

  const [stage, setStage] = useState<Stage>("q7a");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계별 생성 데이터
  const [q7bData, setQ7bData] = useState<Q7BData | null>(null);
  const [q8Data, setQ8Data] = useState<Q8Data | null>(null);
  const [q9Data, setQ9Data] = useState<Q9Data | null>(null);

  // 진행 중 선택 상태
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");

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
      apiStage: "q7b" | "q8" | "q9",
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
        setError("섬의 안내가 잠시 끊겼어. 다시 시도해줄래?");
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
  };

  // 생성 결과를 화면에 반영하는 공통 핸들러 — 제출·재시도·이어하기가 함께 쓴다.
  const showQ7b = (json: unknown) => {
    setQ7bData((json as { q7b: Q7BData }).q7b);
    resetSelection();
    setStage("q7b");
  };
  const showQ8 = (json: unknown) => {
    setQ8Data((json as { q8: Q8Data }).q8);
    resetSelection();
    setStage("q8");
  };
  const showQ9 = (json: unknown) => {
    setQ9Data((json as { q9: Q9Data }).q9);
    resetSelection();
    setStage("q9");
  };

  // Q7~9 답변을 백엔드에 단계별 저장(진행 중). 생성 흐름과 독립 — 실패해도 설문은 막지 않는다.
  // 첫 저장 때 발급받은 sessionId를 스토어에 보관해 다음 저장·완료에서 재사용한다.
  const persistAnswer = (stage: AnswerStage, answer: Record<string, unknown>) => {
    const { studentToken, sessionId, setSessionId } = useSessionStore.getState();
    if (!studentToken) return; // 정상 흐름에선 항상 로그인 상태
    void saveAnswer(studentToken, { sessionId: sessionId ?? undefined, stage, answer })
      .then((res) => {
        if (!sessionId) setSessionId(res.session_id);
      })
      .catch((e) => console.error("답변 저장 실패", stage, e));
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
    persistAnswer("q7a", { first: firstOpt.label, second: secondOpt.label });
    callGenerate(
      "q7b",
      { ...baseInput, q7aFirst: firstOpt.label, q7aSecond: secondOpt.label },
      showQ7b,
    );
  };

  // Q7-B 확정 → Q8 생성
  const submitQ7b = () => {
    if (!q7bData) return;
    const firstOpt = q7bData.options.find((o) => o.subfield_id === first)!;
    const secondOpt = q7bData.options.find((o) => o.subfield_id === second)!;
    setQ7bSelection({ first: firstOpt, second: secondOpt });
    persistAnswer("q7b", {
      first: { subfield_id: firstOpt.subfield_id, title: firstOpt.student_title },
      second: { subfield_id: secondOpt.subfield_id, title: secondOpt.student_title },
    });
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
      showQ8,
    );
  };

  // Q8 확정 → Q9 생성
  const submitQ8 = () => {
    if (!q8Data) return;
    const chips = q8Data.word_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ8Selection({ chips, freeText });
    persistAnswer("q8", { chips: chips.map((c) => c.text), freeText });
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
      showQ9,
    );
  };

  // Q9 답변으로 세션을 완료 저장하고 공개 대기 화면으로 이동한다. Q9가 마지막 질문이다.
  // 탐험대원증 이름·카드는 한마당에서 공개하므로 페르소나 없이 세션만 completed로 승격한다.
  // 제출(submitQ9)과 이어하기(재진입 시 Q9까지 답했지만 완료 저장 전) 양쪽에서 재사용한다.
  const finalizeSurvey = async (
    chips: { text: string }[],
    freeTextValue: string,
  ) => {
    // 완료 저장은 인증 필요. 토큰 없으면 로그인으로.
    const { studentToken, sessionId, setSessionId, setSurveyCompleted } =
      useSessionStore.getState();
    if (!studentToken) {
      router.push("/login");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      // Q9 답변을 먼저 확정 저장한 뒤(세션이 completed로 바뀌기 전) 완료로 승격한다.
      let sid = sessionId ?? undefined;
      const saved = await saveAnswer(studentToken, {
        sessionId: sid,
        stage: "q9",
        answer: { chips: chips.map((c) => c.text), freeText: freeTextValue },
      });
      if (!sid) {
        setSessionId(saved.session_id);
        sid = saved.session_id;
      }
      await completeSurvey(studentToken, null, sid);
      setSurveyCompleted(true);
      router.push("/explore/pending-card");
    } catch {
      pendingRetry.current = () => finalizeSurvey(chips, freeTextValue); // "다시 시도" 시 완료 저장을 재실행
      setError("탐험 기록을 저장하지 못했어. 다시 시도해줄래?");
    } finally {
      setGenerating(false);
    }
  };

  const submitQ9 = () => {
    if (!q9Data) return;
    const chips = q9Data.topic_chips.filter((c) => chipIds.includes(c.chip_id));
    setQ9Selection({ chips, freeText });
    void finalizeSurvey(chips, freeText);
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
    const apiStage = req.stage as "q7b" | "q8" | "q9";
    const onOkMap = { q7b: showQ7b, q8: showQ8, q9: showQ9 };
    callGenerate(apiStage, req.body, onOkMap[apiStage]);
  };

  // 재진입/새로고침 이어하기 — 저장된 선택으로 "완료한 질문 다음 단계"를 다시 생성해 보여준다.
  // 밤 프로그램 선택지는 LLM이 실시간 생성하므로, 이전 답변을 입력으로 다음 단계를 재생성한다.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!ready || resumedRef.current) return;
    resumedRef.current = true;
    const s = useSessionStore.getState();
    const base = {
      riasecScores: s.riasecScores ?? {},
      pairCode: s.pairCode ?? "",
      q1to6: s.answers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string"),
    };
    const a = s.q7aSelection;
    const b = s.q7bSelection;
    // Q9까지 답했지만 완료 저장 전에 이탈 → 완료 저장부터 다시.
    if (s.q9Selection && !s.surveyCompleted) {
      void finalizeSurvey(s.q9Selection.chips, s.q9Selection.freeText);
      return;
    }
    // Q8 완료 → Q9 재생성.
    if (s.q8Selection) {
      callGenerate(
        "q9",
        {
          ...base,
          q7aFirst: a?.first.label ?? "",
          q7aSecond: a?.second.label ?? "",
          q7bFirst: b?.first,
          q7bSecond: b?.second,
          q8: { chips: s.q8Selection.chips, freeText: s.q8Selection.freeText },
        },
        showQ9,
      );
      return;
    }
    // Q7-B 완료 → Q8 재생성.
    if (b) {
      callGenerate(
        "q8",
        {
          ...base,
          q7aFirst: a?.first.label ?? "",
          q7aSecond: a?.second.label ?? "",
          q7bFirst: b.first,
          q7bSecond: b.second,
        },
        showQ8,
      );
      return;
    }
    // Q7-A 완료 → Q7-B 재생성.
    if (a) {
      callGenerate(
        "q7b",
        { ...base, q7aFirst: a.first.label, q7aSecond: a.second.label },
        showQ7b,
      );
      return;
    }
    // 저장된 밤 선택이 없으면 신규 진입 — q7a 그대로 시작.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const toggleChip = (id: string) =>
    setChipIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 2
          ? prev // 최대 2개
          : [...prev, id],
    );

  // 복원 전이거나 진입 조건 미충족이면 가드가 리다이렉트할 때까지 그리지 않는다.
  // (pairCode/riasecScores 널 체크로 아래 렌더의 타입도 좁힌다)
  if (!ready || !pairCode || !riasecScores) return <FlowLoading mood="night" />;

  // 현재 단계의 제목/본문/하단버튼 구성
  const rankReady = first !== null && second !== null;
  const chipReady = chipIds.length > 0 || freeText.trim().length > 0;

  const q7aOptions = getQ7AOptions(pairCode);
  const selectedQ7aLocation = q7aOptions
    .find((option) => option.id === first)
    ?.label.split(/\s*[·•]\s*/)[0]
    .trim();

  let title = "";
  let body: ReactNode = null;
  let cta = "";
  let onCta: () => void = () => {};
  let ctaDisabled = false;

  if (stage === "q7a") {
    title = "등불이 켜진 캠프 공간 중, 오늘 밤 가장 먼저 들어가 보고 싶은 곳은?";
    body = (
      <RankSelect
        options={q7aOptions}
        first={first}
        second={second}
        variant="location"
        onChange={(f, s) => {
          setFirst(f);
          setSecond(s);
        }}
      />
    );
    cta = "등불 아래로 들어가기";
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
    cta = "도구를 주머니에 넣기";
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
    cta = "이렇게 해볼래";
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
    cta = "이걸 더 살펴볼래";
    onCta = submitQ9;
    ctaDisabled = !chipReady;
  }

  if (stage === "q7a") {
    cta = selectedQ7aLocation
      ? `${selectedQ7aLocation}(으)로 들어가기`
      : "장소를 선택해줘";
  }

  const showGenerating = generating || error !== null;
  // 생성 대기 화면 아트는 지금 생성 중인 단계(마지막 요청) 기준.
  const generatingStage =
    (lastReq.current?.stage as GeneratingStage | undefined) ?? "q7b";

  return (
    // overflow-hidden은 배경 컴포넌트가 자체 처리 — main에 걸면 sticky CTA가 죽는다
    <main className="relative flex min-h-[100dvh] flex-col overflow-x-hidden font-sans">
      {/* Q6 해질녘 신호 이후 — 밤이 깊어진 섬에서 심화 탐험이 이어진다 */}
      <ExpeditionBackdrop mood="night" />
      {stage === "q7a" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 78% 12%, rgba(255,245,205,0.18), transparent 24%), linear-gradient(to bottom, rgba(120,136,181,0.92) 0%, rgba(156,155,192,0.9) 36%, rgba(214,194,190,0.88) 68%, rgba(247,229,195,0.96) 100%)",
          }}
        />
      )}
      <TrailBar step={STAGE_INDEX[stage]} total={10} />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-grow flex-col px-5 pb-0 pt-6 sm:px-6">
        {showGenerating ? (
          <GeneratingScreen error={error} onRetry={retry} stage={generatingStage} />
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
              <div className="mb-6 flex items-center">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/35 px-3 py-1.5 text-[11px] font-bold text-ink shadow-sm backdrop-blur-md">
                  <Moon className="h-3 w-3 text-sky-600" />
                  밤 · 별빛 프로그램
                </div>
              </div>

              <h2 className="mb-3 max-w-xl break-keep text-[clamp(27px,6vw,34px)] font-black leading-[1.25] tracking-[-0.025em] text-ink">
                {title}
              </h2>
              {stage === "q7a" && (
                <p className="mb-6 break-keep text-[14px] font-medium leading-relaxed text-ink/65">
                  끌리는 장소를 두 개 골라봐.
                </p>
              )}
              <div className={stage === "q7a" ? "flex-grow pb-5" : "flex-grow pb-32"}>{body}</div>
              <div className="sticky bottom-0 z-10 -mx-5 flex justify-center bg-gradient-to-t from-[#f7e5c3] via-[#f7e5c3]/95 to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-7 sm:-mx-6 sm:px-6">
                <CtaButton
                  onClick={onCta}
                  disabled={ctaDisabled}
                  className="max-w-2xl"
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
