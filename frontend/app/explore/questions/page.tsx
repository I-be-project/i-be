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
import { useKeepTokenFresh } from "@/hooks/useKeepTokenFresh";

// 전체 여정은 10걸음(Q1~6 미션 + Q7~10 심화). 진행도는 항상 10 기준.
const JOURNEY_TOTAL = 10;

const SHEET_SPRING = { type: "spring" as const, stiffness: 360, damping: 40 };

// 시트 배경 — 스크롤과 무관하게 고정된다. 배경을 스크롤하는 콘텐츠에 붙이면 그 배경의
// 윗변이 그라데이션 한가운데를 지나며 "반투명 → 불투명"으로 뚝 끊기는 선을 만든다.
// 그래서 배경은 전부 여기 한 겹으로 모으고, 콘텐츠(글자·선택지 카드)는 투명하게 둔다.
// 설명글이 놓이는 높이(storyHeight)까지는 하늘이 비치는 그라데이션, 그 아래는 시트 본색.
// 위쪽 화살표 영역의 그라데이션(투명 → 0.6)에서 0.6으로 이어받는다.
const sheetBackground = (storyHeight: number) =>
  storyHeight > 0
    ? `linear-gradient(to bottom, rgb(var(--scene-rgb)/0.6) 0px, rgb(var(--scene-rgb)/0.9) ${Math.round(storyHeight * 0.4)}px, var(--scene-bg) ${storyHeight}px)`
    : "var(--scene-bg)";

// 설명·제목·선택지·CTA가 하나의 시트에 담겨 있다.
// 접힌 상태에서는 시트를 "설명글 높이만큼만" 남기고 화면 아래로 내려, 화살표 힌트와
// 상황 설명만 보인다. 위로 밀어 일정 범위(threshold)를 넘기면 시트 전체가 올라오면서
// 설명글이 사라지지 않고 제목·선택지와 함께 한 스크롤 영역 안에서 이어진다.
// 그 아래로만 밀면 다시 접힘 위치로 되돌아간다.
function QuestionScene({
  story,
  title,
  options,
  selectedId,
  onSelect,
  ctaLabel,
  ctaDisabled,
  onCta,
  topInset,
  open,
  onOpenChange,
}: {
  story?: string;
  title: string;
  options: ChoiceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ctaLabel: string;
  ctaDisabled: boolean;
  onCta: () => void;
  // 상단 고정 바(TrailBar 등) 높이 — 시트가 열렸을 때 이 아래로만 올라오게 제한한다.
  topInset: number;
  // 시트 열림 상태는 부모가 소유한다(뒤로가기로 닫을 수 있어야 하므로).
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  // 화살표 힌트만 담은 상단부 — 이 높이를 알아야 열렸을 때 시트가 헤더 바로 아래까지
  // 정확히 차오르도록(넘치면 스크롤) 계산할 수 있다.
  const topSectionRef = useRef<HTMLDivElement>(null);
  const [topSectionHeight, setTopSectionHeight] = useState(120);
  // 시트 본문(설명+제목+선택지+CTA) — 접힌 상태에선 설명글 높이만 남기고 화면 아래로 내려간다.
  const sheetRef = useRef<HTMLDivElement>(null);
  // 설명글 블록 — 접힌 상태에서 화면에 남는 만큼(= 시트에서 덜 내리는 높이).
  const storyRef = useRef<HTMLDivElement>(null);
  const [storyHeight, setStoryHeight] = useState(0);
  // 설명+제목+선택지를 함께 담는 스크롤 영역 — 접을 때 맨 위로 되돌린다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [closedY, setClosedY] = useState(480);
  // ResizeObserver 콜백 안에서 최신 open 값을 읽기 위한 ref(이펙트 재구독 없이).
  const openRef = useRef(open);
  const y = useMotionValue(480);
  const dragControls = useDragControls();

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const el = topSectionRef.current;
    if (!el) return;
    const update = () => setTopSectionHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 설명글 높이 — 그라데이션 띠의 높이로 그대로 쓴다(설명글이 있던 자리를 정확히 대신한다).
  useEffect(() => {
    const el = storyRef.current;
    if (!el) return;
    const update = () => setStoryHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [story]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const update = () => {
      // 열린 상태에선 화살표가 접히며 시트가 그만큼 커지므로, 그 높이로 closedY를 잡으면
      // 접힘 위치가 틀어진다. 접힌 상태(설명이 온전히 보이는 높이)일 때만 갱신한다.
      if (openRef.current) return;
      // 시트 높이에서 설명글 높이만큼을 뺀 만큼만 내린다 → 접혀도 설명글은 화면에 남는다.
      const storyHeight = storyRef.current?.offsetHeight ?? 0;
      const cy = Math.max(sheet.offsetHeight - storyHeight, 80);
      setClosedY(cy);
      if (!inited.current) {
        y.set(cy);
        inited.current = true;
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sheet);
    if (storyRef.current) ro.observe(storyRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤한 만큼 콘텐츠 위쪽을 투명하게 깎아낸다(리렌더 없이 DOM 스타일 직접 갱신).
  // 깎이는 높이 = 스크롤량(설명글 높이가 상한). 설명글이 위로 빠져나가는 만큼만 정확히
  // 깎이므로, 그 자리를 뒤에 고정된 그라데이션 띠가 그대로 이어받는다 →
  // 제목·선택지도 하늘 이미지와 맞닿아 잘리는 대신 그라데이션 속으로 흐려지며 사라진다.
  const applyFadeMask = (el: HTMLDivElement, scrollTop: number) => {
    const fade = Math.min(Math.max(scrollTop, 0), storyHeight);
    const mask =
      fade > 0
        ? `linear-gradient(to bottom, transparent 0px, black ${fade}px)`
        : "";
    el.style.maskImage = mask;
    el.style.setProperty("-webkit-mask-image", mask);
  };

  // open 상태가 바뀌면 열림(0)/접힘(closedY)으로 스냅.
  // 접을 때는 스크롤을 맨 위로 돌려놔야 설명글이 다시 온전히 보인다(열린 채 스크롤했을 수 있음).
  // scrollTop을 코드로 되돌리면 scroll 이벤트가 안 뜰 수 있으니 마스크도 직접 걷어낸다.
  useEffect(() => {
    if (!open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      applyFadeMask(scrollRef.current, 0);
    }
    if (!inited.current) return;
    const controls = animate(y, open ? 0 : closedY, SHEET_SPRING);
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onOpenChange(stayOpen);
          // 항상 열림(0)/접힘(closedY) 둘 중 하나로 스냅한다. setOpen이 같은 값이라 상태가
          // 안 바뀌어도(→ 스냅 effect 미발동) 여기서 직접 애니메이트해 중간에 걸리지 않게 한다.
          animate(y, stayOpen ? 0 : closedY, SHEET_SPRING);
        }}
        className="flex w-full max-w-2xl flex-col"
      >
        {/* 위로 올리기 안내 화살표 — 접힌 상태에서만 보이는 "밀어 올리기" 손잡이.
            펼치면 자리째 접혀(높이 0) 사라지고, 시트가 헤더 바로 아래까지 차오른다.
            뒤에 깔리는 그라데이션은 아래 설명글 블록의 그라데이션으로 이어진다. */}
        <div
          ref={topSectionRef}
          onPointerDown={(e) => dragControls.start(e)}
          className={`relative isolate flex flex-shrink-0 cursor-grab touch-none select-none flex-col px-6 transition-[padding] duration-300 ease-out active:cursor-grabbing ${
            open ? "pt-0 pb-0" : "pt-10 pb-0"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 -z-10"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, rgb(var(--scene-rgb)/0.35) 55%, rgb(var(--scene-rgb)/0.6) 100%)",
            }}
          />

          <div
            className={`grid ${reduce ? "" : "transition-[grid-template-rows] duration-300 ease-out"}`}
            style={{ gridTemplateRows: open ? "0fr" : "1fr" }}
          >
            <div className="overflow-hidden">
              <div className="mb-4 flex justify-center">
                <motion.div
                  className="flex flex-col items-center text-ink drop-shadow-[0_1px_6px_rgba(255,255,255,0.9)]"
                  animate={reduce || open ? undefined : { y: [0, -6, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ChevronUp className="-mb-3 h-6 w-6" strokeWidth={2.8} />
                  <ChevronUp className="h-6 w-6 opacity-70" strokeWidth={2.8} />
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        {/* 시트 본문 — 설명 + 제목 + 선택지가 한 스크롤 영역에 담기고, CTA만 바닥에 고정된다.
            접힌 상태에선 설명글 높이만 남기고 아래로 내려가 있어(closedY) 설명글만 보이고,
            위로 올리면 설명글이 그대로 남은 채 제목·선택지가 이어서 드러난다.
            열렸을 때 헤더 바로 아래까지 꽉 채우는 고정 높이 — 내용이 짧아도 하늘이 남지 않는다. */}
        <div
          ref={sheetRef}
          className="relative flex flex-col"
          style={{
            height: `calc(100dvh - ${topInset + topSectionHeight + 16}px)`,
            background: sheetBackground(storyHeight),
          }}
        >
          {/* 스크롤 영역. 배경은 투명하게 둔다 — 뒤에 깔린 그라데이션 띠가 비쳐야 하므로.
              overscroll-none으로 iOS 고무줄 스크롤을 끈다(튕기는 순간 콘텐츠만 밀려나고
              컨테이너에는 칠할 게 없어 뒤의 배경 씬이 드러나기 때문). */}
          <div
            ref={scrollRef}
            onScroll={(e) => applyFadeMask(e.currentTarget, e.currentTarget.scrollTop)}
            className={`flex flex-1 flex-col overscroll-none ${open ? "overflow-y-auto" : "overflow-hidden"}`}
          >
            {/* 설명 — 접힌 상태에선 이 블록만 화면에 보이며 드래그 손잡이 역할도 한다.
                열리면 스크롤 영역의 맨 위 콘텐츠가 되어 제목·선택지와 함께 스크롤된다.
                배경은 갖지 않는다 — 뒤에 고정된 그라데이션 띠가 그 자리를 채운다. */}
            {story && (
              <div
                ref={storyRef}
                onPointerDown={(e) => {
                  // 열린 상태에선 스크롤을 방해하지 않도록 드래그를 시작하지 않는다.
                  if (!open) dragControls.start(e);
                }}
                className={`shrink-0 px-6 pb-5 pt-1 ${
                  open
                    ? ""
                    : "cursor-grab touch-none select-none active:cursor-grabbing"
                }`}
              >
                <p className="break-keep text-[15px] font-semibold leading-relaxed text-ink-soft drop-shadow-[0_1px_10px_rgba(255,255,255,0.6)]">
                  {story}
                </p>
              </div>
            )}

            {/* 제목·선택지 — 배경 없음. 시트의 고정 배경 위를 글자와 카드만 지나간다. */}
            <div className="flex-1">
              <h2 className="break-keep px-6 pb-3 pt-1 text-[1.9rem] font-black leading-[1.18] tracking-tight text-ink">
                {title}
              </h2>
              <div className="px-6 pb-4">
                <ChoiceRow
                  themed
                  options={options}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </div>
            </div>
          </div>

          {/* CTA — 시트 하단에 고정 */}
          <div
            className="shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
            style={{
              background:
                "linear-gradient(to bottom, var(--scene-bg), var(--scene-bg-soft))",
            }}
          >
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
  useKeepTokenFresh(); // Q1~6 진행 중 토큰 6h 만료 예방(주기·탭 복귀 시 갱신)
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const upsertAnswer = useSessionStore((state) => state.upsertAnswer);
  const setRiasec = useSessionStore((state) => state.setRiasec);

  const questions = mockQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  // 시트 열림 상태를 부모가 소유 — 뒤로가기로 라우트 이동 대신 설명 화면으로 되돌릴 수 있게 한다.
  const [sheetOpen, setSheetOpen] = useState(false);

  // 상단 고정 바 높이 — 시트가 열렸을 때 이 아래로만 올라오게 QuestionScene에 전달한다.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(96);
  useEffect(() => {
    // ready가 false인 첫 렌더에선 헤더가 아직 그려지지 않아 el이 null이다.
    // ready가 true로 바뀌어 헤더가 실제로 마운트된 뒤에 다시 시도해야 한다.
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

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
    // 시트가 열려 있으면(질문/선택지 노출) 라우트를 벗어나지 않고 설명 화면으로 되돌린다.
    if (sheetOpen) {
      setSheetOpen(false);
      return;
    }
    if (currentIndex === 0) {
      router.push("/explore");
      return;
    }
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }
    // 이전 질문도 설명 화면(접힌 상태)부터 다시 시작한다.
    setSheetOpen(false);
    setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = async () => {
    if (currentAnswer.trim().length > 0) {
      upsertAnswer({ questionId: currentQuestion.id, value: currentAnswer });
    }

    if (currentIndex < questions.length - 1) {
      // 다음 질문은 설명 화면(접힌 상태)부터 시작한다.
      setSheetOpen(false);
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
      <div
        ref={headerRef}
        className="fixed left-1/2 top-0 z-30 w-full max-w-2xl -translate-x-1/2"
      >
        <TrailBar step={currentIndex + 1} total={JOURNEY_TOTAL} />
        <div className="relative flex items-start justify-end px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
          {/* Q1~6은 앞뒤 이동 가능 — 첫 질문에서는 브리핑 화면으로 돌아간다 */}
          <button
            type="button"
            onClick={handleBack}
            aria-label={sheetOpen ? "설명 다시 보기" : "이전 질문"}
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
            topInset={headerHeight}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
          />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
