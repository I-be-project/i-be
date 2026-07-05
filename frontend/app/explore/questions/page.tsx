"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { ExpeditionBackdrop, type SceneId } from "@/components/voyage/ExpeditionScene";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { SceneAssetImage } from "@/components/voyage/SceneAssetImage";
import { ChoiceRow } from "@/components/explore/ChoiceRow";
import { computeScores, derivePairCode } from "@/lib/scoring";
import { saveAnswer } from "@/lib/api";
import { sceneAssets } from "@/lib/assets/sceneManifest";

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

// 장면 CSS 변수 묶음 — 커스텀 프로퍼티(--scene-*)만 담기 위한 타입.
type SceneVars = CSSProperties & Record<`--${string}`, string>;

// Q1~4 낮 / Q5 석양 / Q6 보라 노을. 질문·선택지 영역의 파스텔 톤을 CSS 변수로 주입한다.
// --scene-rgb는 스크롤 파스텔 배경의 알파 스톱용(공백 구분 RGB, --scene-bg와 동일 색).
// --scene-bg-soft는 하단 CTA·선택지 바닥의 살짝 밝은 동일 계열 톤(평면감 방지).
const SCENE_THEMES: Record<"q1to4" | "q5" | "q6", SceneVars> = {
  q1to4: {
    "--scene-bg": "#EAF6FB",
    "--scene-bg-soft": "#F2FAFD",
    "--scene-rgb": "234 246 251",
    "--scene-option-bg": "rgba(255,255,255,0.84)",
    "--scene-option-border": "rgba(255,255,255,0.6)",
    "--scene-option-selected": "#D9EFF8",
    "--scene-accent": "#68B8D9",
  },
  q5: {
    "--scene-bg": "#FCE9DA",
    "--scene-bg-soft": "#FEF3EA",
    "--scene-rgb": "252 233 218",
    "--scene-option-bg": "rgba(255,252,248,0.86)",
    "--scene-option-border": "rgba(255,255,255,0.6)",
    "--scene-option-selected": "#F8D7C1",
    "--scene-accent": "#E59A6F",
  },
  q6: {
    "--scene-bg": "#EEE6F5",
    "--scene-bg-soft": "#F6F0FA",
    "--scene-rgb": "238 230 245",
    "--scene-option-bg": "rgba(255,251,255,0.86)",
    "--scene-option-border": "rgba(255,255,255,0.6)",
    "--scene-option-selected": "#E1D2ED",
    "--scene-accent": "#A98AC4",
  },
};

export default function QuestionsPage() {
  const router = useRouter();
  const addAnswer = useSessionStore((state) => state.addAnswer);
  const setRiasec = useSessionStore((state) => state.setRiasec);
  const answers = useSessionStore((state) => state.answers);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  // 스크롤 유도 표시 노출 여부 — 새 질문마다 다시 보이고, 살짝만 스크롤해도 사라진다.
  const [showHint, setShowHint] = useState(true);
  const reduce = useReducedMotion();

  const currentQuestion = questions[currentIndex];
  // Q1~4 / Q5 / Q6 테마 (질문 id 기준으로 프론트에서 계산 — 데이터 구조 불변)
  const sceneTheme: "q1to4" | "q5" | "q6" =
    currentQuestion.id <= 4 ? "q1to4" : currentQuestion.id === 5 ? "q5" : "q6";

  // 다음 장면으로 넘어가면 맨 위(장면 창)부터 다시 보이게 (스크롤 안내 복원은 handleNext에서 처리)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentIndex]);

  // 살짝이라도 위로 밀어 올리면(스크롤) 안내 표시를 감춘다.
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 24) setShowHint(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNext = async () => {
    let nextAnswers = answers;
    if (currentAnswer.trim().length > 0) {
      const answer = { questionId: currentQuestion.id, value: currentAnswer };
      addAnswer(answer);
      nextAnswers = [...answers, answer];
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer("");
      setShowHint(true); // 새 장면에선 스크롤 안내를 다시 보여준다
    } else {
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 밤 브릿지로 이동
      const optionIds = nextAnswers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string");
      const scores = computeScores(optionIds);
      const pairCode = derivePairCode(scores);
      setRiasec(scores, pairCode);

      // Q1~6 결과를 한 번에 저장(= in_progress 세션 생성). 이후 Q7~9 저장이 이 세션을 재사용한다.
      // 세션 id를 확보한 뒤 이동하려고 await 하되, 실패해도 설문 진행은 막지 않는다.
      const { studentToken, sessionId, setSessionId } = useSessionStore.getState();
      if (studentToken) {
        try {
          const res = await saveAnswer(studentToken, {
            sessionId: sessionId ?? undefined,
            stage: "q1to6",
            answer: { answers: nextAnswers, optionIds, riasec: scores, pairCode },
          });
          if (!sessionId) setSessionId(res.session_id);
        } catch (e) {
          console.error("Q1~6 결과 저장 실패", e);
        }
      }

      router.push("/explore/evening");
    }
  };

  const isNextDisabled = currentAnswer.trim().length === 0;
  const isLast = currentIndex === questions.length - 1;
  // 장면 무드는 질문 id(1~6) 기준. 범위를 벗어나면 마지막 장면 유지.
  const sceneId = Math.min(6, Math.max(1, currentQuestion.id)) as SceneId;
  const sceneAsset = sceneAssets[sceneId];

  const choiceOptions =
    currentQuestion.options?.map((o) => ({
      id: o.id,
      label: o.label,
      riasec: o.primary,
    })) ?? [];

  return (
    <main className="relative min-h-[100dvh] bg-sand font-sans">
      <ExpeditionBackdrop mood={sceneId} />

      {/* 상단 고정 바 — 진행도 + 장면명 + 진행 단계. 스크롤해도 항상 보인다(프레임 폭에 맞춰 가운데 고정). */}
      <div className="fixed left-1/2 top-0 z-30 w-full max-w-2xl -translate-x-1/2">
        <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />
        <div className="flex items-start justify-between px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
          <span className="glass-card rounded-full px-3 py-1.5 text-[11px] font-bold text-ink">
            장면 {currentIndex + 1} · {currentQuestion.scene}
          </span>
          <span className="glass-card rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
            {currentIndex + 1}/{JOURNEY_TOTAL}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          data-theme={sceneTheme}
          style={SCENE_THEMES[sceneTheme]}
          className="relative z-10 mx-auto w-full max-w-2xl"
        >
          {/* 배경 장면 — 스크롤해도 화면 뒤에 고정(sticky). 콘텐츠가 그 위로 흐른다.
              -mb-[100dvh]로 흐름 높이를 0으로 만들어, 이어지는 콘텐츠가 배경 위에 겹쳐 시작한다. */}
          <div className="pointer-events-none sticky top-0 -mb-[100dvh] h-[100dvh] w-full overflow-hidden bg-[#49a7e0]">
            <SceneAssetImage
              asset={sceneAsset}
              priority
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>

          {/* 첫 화면 히어로 — 배경 위에 겹쳐 시작. 최소 100dvh를 확보해 선택지를 첫 화면 밖으로 민다.
              isolate로 스택 컨텍스트를 만들어, 아래 파스텔 배경(-z-10)은 이미지 위·콘텐츠 아래에 놓인다. */}
          <section className="relative isolate flex min-h-[100dvh] flex-col px-6 pb-28 pt-[calc(env(safe-area-inset-top)+1.75rem)]">
            {/* 콘텐츠와 함께 스크롤되는 파스텔 배경 — 상황설명·질문이 늘 파스텔 위에 놓여 잘 읽히고,
                하단이 선택지 영역과 같은 색(--scene-bg)이라 스크롤해도 그라데이션으로 자연스럽게 이어진다.
                이미지 중간까지는 선명, 아래로 갈수록 파스텔이 짙어진다. */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[58%]"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 0%, rgb(var(--scene-rgb)/0.4) 30%, rgb(var(--scene-rgb)/0.9) 62%, var(--scene-bg) 84%)",
              }}
            />
            {/* 위쪽은 배경 이미지·상단 고정 바가 보이도록 비워 두고, 텍스트를 화면 하단으로 정렬 */}
            <div className="flex-1" />

            {/* 스크롤 유도 표시 — 상황 설명 위 중앙. 위로 밀어 올리면 사라진다. */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none mb-3 flex flex-col items-center gap-1 self-center"
              animate={{ opacity: showHint ? 1 : 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="flex flex-col items-center text-white drop-shadow-[0_1px_5px_rgba(13,48,71,0.4)]"
                animate={reduce ? undefined : { y: [0, -5, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ChevronUp className="-mb-2.5 h-5 w-5 opacity-90" strokeWidth={2.4} />
                <ChevronUp className="h-5 w-5 opacity-60" strokeWidth={2.4} />
              </motion.div>
              <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-[11px] font-bold text-white/95 backdrop-blur-sm">
                위로 밀어 선택하기
              </span>
            </motion.div>

            {/* 상황 설명 — 별도 카드 없이 장면에 자연스럽게 이어지도록 */}
            {currentQuestion.story && (
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-4 break-keep text-[15px] font-semibold leading-relaxed text-ink-soft drop-shadow-[0_1px_10px_rgba(255,255,255,0.6)]"
              >
                {currentQuestion.story}
              </motion.p>
            )}

            {/* 질문 제목 — 시각적 우선순위를 명확히 (더 크고 굵게) */}
            <h2 className="break-keep text-[1.9rem] font-black leading-[1.18] tracking-tight text-ink drop-shadow-[0_1px_12px_rgba(255,255,255,0.55)]">
              {currentQuestion.text}
            </h2>
          </section>

          {/* 선택지 — 첫 화면 아래에서 시작. 장면별 파스텔 배경 위에 카드가 놓인다(별도 흰 판 없음). */}
          <section
            className="relative px-6 pb-40 pt-6"
            style={{
              background:
                "linear-gradient(to bottom, var(--scene-bg), var(--scene-bg-soft))",
            }}
          >
            <ChoiceRow
              themed
              options={choiceOptions}
              selectedId={currentAnswer || null}
              onSelect={setCurrentAnswer}
            />
          </section>

          {/* 하단 고정 CTA — 뒤 배경을 장면 파스텔로 깔아 콘텐츠와 자연스럽게 분리 */}
          <div
            className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-2xl -translate-x-1/2 justify-center p-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
            style={{
              background:
                "linear-gradient(to top, var(--scene-bg-soft), var(--scene-bg-soft) 42%, transparent)",
            }}
          >
            <CtaButton
              onClick={handleNext}
              disabled={isNextDisabled}
              className="max-w-2xl"
            >
              {isLast ? "캠프로 돌아가기" : "다음 장면으로"}
            </CtaButton>
          </div>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
