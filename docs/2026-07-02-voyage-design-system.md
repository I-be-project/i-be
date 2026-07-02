# 나비섬 원정(Voyage) 디자인 시스템

2026-07-02. 학생 여정 전 화면의 디자인 언어를 웰컴 화면 기준으로 통일한 재디자인 기록.

## 배경 (문제)

화면마다 디자인 언어가 달랐다.

| 영역 | 기존 스타일 |
| --- | --- |
| 웰컴(`/`) | 하늘·바다 블루 + 나비섬 히어로 일러스트 |
| 탐험(`/explore/*`) | 라벤더·퍼플 "celestial" 테마 (인디고→퍼플 그라데이션) |
| 결과/카드/프로필 | 흰 배경 + zinc 회색 + 인디고 플랫 버튼 |
| 인증(`/login`, `/signup`) | ocean 톤이지만 레이아웃 제각각 (바텀시트 vs 센터 카드) |

또한 Q1~6의 "나비섬 탐험 캠프" 스토리가 질문 텍스트에만 존재하고
화면 디자인·카피에는 전혀 반영되지 않았다 (`explorationIntro`는 미사용 상태였다).

## 원칙

1. **한 세계관** — 모든 학생 화면은 나비섬의 하루 안에 있다: 위는 하늘, 가운데는 바다, 발 밑은 모래사장.
2. **한 여정** — 가입부터 카드 발급까지가 하나의 원정 스토리다. 진행바는 Q1~10을 하나의 지도(10걸음)로 보여준다.
3. **모바일 퍼스트** — 행사장에서 학생 폰으로 쓴다. `max-w-md` 단일 컬럼, 하단 고정 CTA(엄지 존), `safe-area-inset-bottom` 패딩.
4. 운영자/관리자(`/admin/*`)는 업무 도구이므로 중립 shadcn 토큰을 유지한다 (스토리 대상 아님).

## 스토리 아크 → 화면 매핑

| 화면 | 장면 | 핵심 카피 |
| --- | --- | --- |
| `/` | 초대장 | "나비섬으로 떠나는 여정을 시작해" |
| `/signup` | 탐험대 등록 1/2 | "먼저 너를 알려줘" |
| `/signup/photo` | 탐험대 등록 2/2 | "대원증에 붙일 사진을 담아줘" |
| `/login` | 돌아온 탐험대원 | "다시 만나서 반가워 · 다시 승선해줘" |
| `/explore` | 탐험 브리핑 | "나비섬에 도착했어!" + `explorationIntro` 스토리 카드 |
| `/explore/questions` | 미션 1~6 | 문항마다 "장면 N · {scene}" 칩 (선착장 도착, 역할 정하기, …) |
| `/explore/path` | 심화 탐험 7~10 | "이 구역으로 떠나기" 등 기존 카피 유지 |
| `/explore/interpreting` | 기록 해석 | "나비섬에서의 탐험 기록을 읽고 있어…" (나침반 + 물결 링) |
| `/explore/result` | 페르소나 발견 | "나비섬 탐험 완료" 배지 + 글래스 결과 카드 |
| `/explore/card` | 대원증 발급 | "나의 탐험대원증" — 카드는 밤바다 남색 버전 |
| `/profile/[id]` | 내 탐험 기록 | "아직 나비섬에 다녀오지 않았구나" / "다시 탐험하기" |

## 토큰 (`app/globals.css`)

```
@theme
  --color-ink        #0d3047   제목 (text-ink)
  --color-ink-soft   #1d4a5e   본문 (text-ink-soft)
  --color-ink-muted  #4c6a82   보조 (text-ink-muted)
  --color-sand       #fdf3e0   하단 모래 톤 — 스크림·배경 끝색 공유 (from-sand)

.bg-voyage    하늘→바다→모래 그라데이션 (학생 여정 공통 배경)
.glass-card   글래스 표면 (배지·칩·카드)
```

- 강조/CTA 그라데이션: `from-sky-500 to-blue-600` (웰컴 CTA와 동일)
- 보조 액센트: amber(햇살) — 결과 화면의 추천 부스 등 제한적으로만
- 선택 상태: sky→blue 그라데이션 채움 + 흰 텍스트, 비선택: `bg-white/80 border-white/70` 글래스

## 공용 컴포넌트 (`components/voyage/`)

- **`VoyageBackground`** — 공통 배경. `bright`(장면 화면: 브리핑/해석/결과/카드) / `soft`(폼·설문). 구름·햇살·반짝임·모래 글로우·나비 실루엣. 장식 좌표는 전부 고정값(하이드레이션 안정). 자체적으로 `overflow-hidden` 처리.
- **`CtaButton`** — 필(pill) CTA. `h-14 rounded-full` + sky→blue 그라데이션. 화면별 버튼 스타일 표류 방지.
- **`JourneyProgress`** — 탐험 진행 헤더(나침반 + n/10). ui/Progress(base-ui)는 Track/Indicator 구조라 외부에서 색을 덮기 어려워 직접 그린다.

## 주의사항 (하다 발견한 함정)

- `main`에 `overflow-hidden`을 걸면 내부 `position: sticky` CTA가 죽는다. 배경 클리핑은 `VoyageBackground`가 자체 처리하므로 main에는 걸지 않는다.
- `ui/progress.tsx`(base-ui)에 `[&>div]:bg-*`를 쓰면 Indicator가 아니라 Track에 칠해진다 (기존 버그였음).
- 하단 고정 CTA의 스크림은 `from-sand via-sand/80` — 배경 그라데이션의 끝색과 반드시 일치해야 자연스럽다.
