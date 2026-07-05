"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useDragControls,
  animate,
} from "framer-motion";
import { ChevronLeft, ChevronUp } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { mockQuestions } from "@/lib/mock/questions";
import { ExpeditionBackdrop, type SceneId } from "@/components/voyage/ExpeditionScene";
import { TrailBar } from "@/components/voyage/TrailBar";
import { CtaButton } from "@/components/voyage/CtaButton";
import { SceneAssetImage } from "@/components/voyage/SceneAssetImage";
import { FlowLoading } from "@/components/voyage/FlowLoading";
import { ChoiceRow, type ChoiceOption } from "@/components/explore/ChoiceRow";
import { computeScores, derivePairCode } from "@/lib/scoring";
import { persistStage } from "@/lib/answerSync";
import { sceneAssets } from "@/lib/assets/sceneManifest";
import { useFlowGuard } from "@/lib/explore/flow";

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

const SHEET_SPRING = { type: "spring" as const, stiffness: 360, damping: 40 };
// 접힌 상태에서 라운드 상단이 살짝 보이도록 남겨두는 peek 높이
const SHEET_PEEK = 24;

// 힌트·설명·제목이 선택지 메뉴 바로 위에 "붙어" 있는 하나의 시트.
// 평소엔 선택지+CTA 블록만 화면 아래로 접혀 숨어 있고(힌트·설명·제목은 그대로 보임),
// 위로 밀어 일정 범위(threshold)를 넘기면 같은 하나의 몸으로 함께 부드럽게 올라가
// 선택지가 드러난다. 그 아래로만 밀면 다시 접힘 위치로 되돌아간다.
function QuestionScene({
  story,
  title,
  options,
  selectedId,
  onSelect,
  ctaLabel,
  ctaDisabled,
  onCta,
}: {
  story?: string;
  title: string;
  options: ChoiceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctaLabel: string;
  ctaDisabled: boolean;
  onCta: () => void;
}) {
  const reduce = useReducedMotion();
  // 선택지+CTA 블록 — 접힌 상태에서 이 높이만큼 화면 아래로 내려가 숨는다.
  const hiddenRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [closedY, setClosedY] = useState(480);
  const [open, setOpen] = useState(false);
  const y = useMotionValue(480);
  const dragControls = useDragControls();

  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    const update = () => {
      // peek 높이만큼 덜 내려, 접혀도 라운드 상단이 살짝 보이고 제목이 바닥에 딱 붙지 않는다.
      const cy = Math.max(el.offsetHeight - SHEET_PEEK, 80);
      setClosedY(cy);
      if (!inited.current) {
        y.set(cy);
        inited.current = true;
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // open 상태가 바뀌면 열림(0)/접힘(closedY)으로 스냅.
  useEffect(() => {
    if (!inited.current) return;
    const controls = animate(y, open ? 0 : closedY, SHEET_SPRING);
    return () => controls.stop();
  }, [open, closedY, y]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center">
      <motion.div
        style={{ y }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: closedY }}
        dragElastic={{ top: 0.02, bottom: 0.28 }}
        onDragEnd={(_, info) => {
          // 접힘 위치에서 위로 얼마나 끌어올렸는지(px). 임계값(threshold)을 넘겨야 열림으로 스냅,
          // 그 아래면 다시 접힘으로 되돌아간다. 세게 튕겨 올리면(강한 위쪽 velocity) 거리와 무관하게 열림.
          const draggedUp = closedY - y.get();
          const threshold = Math.min(closedY * 0.3, 130);
          const stayOpen =
            info.velocity.y < -650
              ? true
              : info.velocity.y > 650
                ? false
                : draggedUp > threshold;
          setOpen(stayOpen);
          // 항상 열림(0)/접힘(closedY) 둘 중 하나로 스냅한다. setOpen이 같은 값이라 상태가
          // 안 바뀌어도(→ 스냅 effect 미발동) 여기서 직접 애니메이트해 중간에 걸리지 않게 한다.
          animate(y, stayOpen ? 0 : closedY, SHEET_SPRING);
        }}
        className="flex w-full max-w-2xl flex-col"
      >
        {/* 힌트 + 설명 + 제목 — 메뉴 바로 위에 붙어 항상 보이고, 여기서 드래그 시작.
            그라데이션은 설명 위(힌트 위쪽)까지 이어져 이미지 위에서도 글씨가 잘 읽힌다. */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="relative isolate flex flex-shrink-0 cursor-grab touch-none select-none flex-col px-6 pb-1 pt-10 active:cursor-grabbing"
        >
          {/* 뒤에 깔리는 그라데이션 — 힌트 위쪽(-top)부터 시작해 설명 부분 위까지 이어진다.
              메뉴와 같은 부모 안에 있어 함께 움직인다(별도 정적 레이어가 아님). */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 -z-10"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, rgb(var(--scene-rgb)/0.4) 28%, rgb(var(--scene-rgb)/0.82) 52%, rgb(var(--scene-rgb)/0.98) 74%, var(--scene-bg) 100%)",
            }}
          />

          {/* 위로 올리기 안내 — 제목·설명 위 화살표(열리면 방향 반전) */}
          <div className="mb-4 flex justify-center">
            <motion.div
              className="flex flex-col items-center text-ink-muted"
              animate={reduce || open ? undefined : { y: [0, -4, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronUp
                className={`-mb-2.5 h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={2.4}
              />
              <ChevronUp
                className={`h-5 w-5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={2.4}
              />
            </motion.div>
          </div>

          {story && (
            <p className="mb-4 break-keep text-[15px] font-semibold leading-relaxed text-ink-soft drop-shadow-[0_1px_10px_rgba(255,255,255,0.6)]">
              {story}
            </p>
          )}
          {/* 제목 아래 여백 — 접힘 상태에서 제목과 메뉴 사이에 숨 쉴 공간을 준다 */}
          <h2 className="break-keep pb-3 text-[1.9rem] font-black leading-[1.18] tracking-tight text-ink drop-shadow-[0_1px_12px_rgba(255,255,255,0.55)]">
            {title}
          </h2>
        </div>

        {/* 선택지 + CTA — 접힌 상태에선 이 블록 높이만큼 화면 아래로 숨는다.
            위 텍스트 영역과 같은 파스텔 색으로 이어지는 평평한 상단(라운드 없음).
            내부 스크롤 없이 리스트 전체가 한 번에 끝까지 올라와 보인다. */}
        <div
          ref={hiddenRef}
          className="flex flex-col"
          style={{
            background:
              "linear-gradient(to bottom, var(--scene-bg), var(--scene-bg-soft))",
          }}
        >
          {/* 선택지 — 전체가 한 번에 드러난다(스크롤 없음) */}
          <div className="px-6 pt-5 pb-4">
            <ChoiceRow
              themed
              options={options}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>

          {/* CTA — 시트 하단에 고정 */}
          <div className="shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
            <CtaButton onClick={onCta} disabled={ctaDisabled} className="max-w-2xl">
              {ctaLabel}
            </CtaButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

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
  const { ready } = useFlowGuard("questions");
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const upsertAnswer = useSessionStore((state) => state.upsertAnswer);
  const setRiasec = useSessionStore((state) => state.setRiasec);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");

  const currentQuestion = questions[currentIndex];
  // Q1~4 / Q5 / Q6 테마 (질문 id 기준으로 프론트에서 계산 — 데이터 구조 불변)
  const sceneTheme: "q1to4" | "q5" | "q6" =
    currentQuestion.id <= 4 ? "q1to4" : currentQuestion.id === 5 ? "q5" : "q6";

  // 복원 완료 시 저장된 답변 개수로 "마지막으로 답한 다음 질문"에서 이어서 시작한다.
  const initedRef = useRef(false);
  useEffect(() => {
    if (!hasHydrated || initedRef.current) return;
    initedRef.current = true;
    const stored = useSessionStore.getState().answers;
    if (stored.length > 0) {
      // 외부 스토어(localStorage 복원) → 로컬 상태 시딩. 복원이 끝난 뒤 한 번만 반영한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentIndex(Math.min(stored.length, questions.length - 1));
    }
  }, [hasHydrated, questions.length]);

  // 현재 질문에 이미 답이 있으면(뒤로 왔거나 이어하기) 그 선택을 불러온다.
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const existing = useSessionStore
      .getState()
      .answers.find((a) => a.questionId === q.id);
    // 현재 질문의 저장된 선택을 로컬 편집 상태로 시딩(뒤로/이어하기 시 유지).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentAnswer(typeof existing?.value === "string" ? existing.value : "");
  }, [currentIndex, questions]);

  // Q1~6은 앞뒤로 오갈 수 있다. 뒤로 갈 때도 지금 선택을 저장해 두면 다시 왔을 때 유지된다.
  // 첫 질문에서 뒤로 가면 질문 흐름 이전 화면(브리핑)으로 돌아간다.
  const handleBack = () => {
    if (currentIndex === 0) {
      router.push("/explore");
      return;
    }
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }
    setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = async () => {
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 뒤로 갔다 오며 답을 바꿨을 수 있으니 저장된 최종 답변을 다시 읽어 점수를 낸다.
      const nextAnswers = useSessionStore.getState().answers;
      // Q1~6 선택 ID로 RIASEC 점수·Pair Code 산출 후 밤 브릿지로 이동
      const optionIds = nextAnswers
        .map((a) => a.value)
        .filter((v): v is string => typeof v === "string");
      const scores = computeScores(optionIds);
      const pairCode = derivePairCode(scores);

      // Q1~6 결과를 한 번에 저장(= in_progress 세션 생성). 이후 Q7~9 저장이 이 세션을 재사용한다.
      // persistStage가 재시도 + sessionId single-flight를 담당한다.
      const { studentToken } = useSessionStore.getState();
      if (studentToken) {
        try {
          await persistStage(studentToken, "q1to6", {
            answers: nextAnswers,
            optionIds,
            riasec: scores,
            pairCode,
          });
        } catch (e) {
          // 저장이 최종 실패해도 진행은 막지 않는다. answers/riasec/pairCode는
          // 스토어(localStorage)에 남고, 완료 시 reconcileAllAnswers가 세션에 재전송해 보장한다.
          console.error("Q1~6 저장 실패(완료 시 재동기화로 보장됨)", e);
        }
      }

      // 세션 저장 뒤 RIASEC/PairCode 확정 → 가드가 evening으로 이어준다(직접 push도 함께).
      setRiasec(scores, pairCode);
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

  // 복원 전이거나 진행상황에 맞지 않는 진입이면 가드가 리다이렉트할 때까지 로딩 화면을
  // 보여준다(null이면 AppFrame의 빈 하늘색 프레임만 노출돼 "하늘에 갇힌" 것처럼 보인다).
  if (!ready) return <FlowLoading />;

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-sand font-sans">
      <ExpeditionBackdrop mood={sceneId} />

      {/* 상단 고정 바 — 진행도 + 장면명 + 진행 단계 + 뒤로가기. 화면이 스크롤되지 않으므로 항상 보인다
          (프레임 폭에 맞춰 가운데 고정 — 뒤로가기 버튼도 이 컨테이너 기준 좌측에 둔다). */}
      <div className="fixed left-1/2 top-0 z-30 w-full max-w-2xl -translate-x-1/2">
        <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />
        <div className="relative flex items-start justify-end px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
          {/* Q1~6은 앞뒤 이동 가능 — 첫 질문에서는 브리핑 화면으로 돌아간다 */}
          <button
            type="button"
            onClick={handleBack}
            aria-label="이전 질문"
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+1.75rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink shadow-[0_2px_10px_rgba(14,58,79,0.15)] backdrop-blur transition-colors hover:bg-white/90 active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="glass-card rounded-full px-3 py-1.5 text-[11px] font-bold text-ink">
            장면 {currentIndex + 1} · {currentQuestion.scene}
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
          className="absolute inset-0 z-10 mx-auto w-full max-w-2xl"
        >
          {/* 배경 장면 — 화면 전체를 채운다(더 이상 스크롤이 없으므로 sticky 트릭이 불필요). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#49a7e0]">
            <SceneAssetImage
              asset={sceneAsset}
              priority
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>

          <QuestionScene
            story={currentQuestion.story}
            title={currentQuestion.text}
            options={choiceOptions}
            selectedId={currentAnswer || null}
            onSelect={setCurrentAnswer}
            ctaLabel={isLast ? "캠프로 돌아가기" : "다음 장면으로"}
            ctaDisabled={isNextDisabled}
            onCta={handleNext}
          />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
