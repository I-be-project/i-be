# 나Be한마당 페르소나 카드 — 프론트엔드 프로토타입 개발 계획서

## 기술 스택

| 항목 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| 스타일링 | Tailwind CSS v4 |
| UI 컴포넌트 | shadcn/ui |
| 상태 관리 | Zustand |
| 애니메이션 | Framer Motion |
| 패키지 매니저 | pnpm |

---

## 프로토타입 범위

백엔드 연동 없이 프론트엔드 단독으로 전체 UX 흐름을 검증하는 것이 목표다.

LLM 응답, 카드 생성, QR 기록 등은 **mock 데이터**로 대체한다.

### 포함 범위

- 학생용 전체 플로우 (웰컴 → 탐색 → 결과 → 카드 발급 → 개인 페이지)
- 운영자용 플로우 (로그인 → QR 스캔 → 기록 완료)
- 관리자용 플로우 (대시보드 — 레이아웃 및 차트 수준)

### 제외 범위

- 실제 LLM API 연동
- 이미지 생성 연동
- QR 실제 카메라 스캔 (버튼으로 대체)
- 인증/세션 처리 (mock)
- DB 연동

---

## 라우팅 구조

```
app/
├── page.tsx                        # 웰컴 화면 (랜딩)
│
├── explore/                        # 학생용 탐색 플로우
│   ├── page.tsx                    # 입력 방식 선택
│   ├── questions/
│   │   └── page.tsx                # 질문 진행 화면
│   ├── interpreting/
│   │   └── page.tsx                # 해석 중간 화면
│   ├── result/
│   │   └── page.tsx                # 결과 화면
│   └── card/
│       └── page.tsx                # 카드 발급 화면
│
├── profile/
│   └── [id]/
│       └── page.tsx                # 개인 페이지 (체험 기록, 배지, 추천)
│
├── operator/                       # 운영자용
│   ├── page.tsx                    # 로그인
│   ├── scan/
│   │   └── page.tsx                # QR 스캔 화면
│   └── done/
│       └── page.tsx                # 기록 완료 화면
│
└── admin/                          # 관리자용
    ├── page.tsx                    # 대시보드
    ├── content/
    │   └── page.tsx                # 콘텐츠 관리
    └── stats/
        └── page.tsx                # 결과 분석
```

---

## 화면별 구현 명세

### 1. 웰컴 화면 `/`

**목적:** 행사 소개 및 탐색 시작 유도

**구성 요소:**
- 행사 타이틀 + 슬로건 ("너는 어떤 미래를 살아보고 싶니?")
- 시작 버튼 (→ `/explore`)
- 개인정보 동의 체크박스 (shadcn Checkbox)
- 배경: 부드러운 그라디언트 또는 일러스트

---

### 2. 입력 방식 선택 `/explore`

**목적:** 학생 자기 표현 방식에 맞는 탐색 모드 선택

**구성 요소:**
- 4개의 선택 카드 (shadcn Card)
  - 말로 답하기 (텍스트 입력)
  - 이미지 고르기
  - 단어 고르기
  - 미니 게임형
- 선택 시 해당 질문 모드로 라우팅

**상태:** 선택된 모드를 Zustand store에 저장 → 질문 화면에서 모드별 UI 분기

---

### 3. 질문 진행 화면 `/explore/questions`

**목적:** 학생의 관심·취향·감각 수집

**공통 구성:**
- 상단 진행률 바 (shadcn Progress)
- 질문 카드 (Framer Motion 슬라이드 전환)
- 다음 버튼

**모드별 UI:**

| 모드 | 구현 방식 |
|---|---|
| 말로 답하기 | shadcn Textarea + 제출 |
| 이미지 고르기 | 이미지 카드 그리드 (다중 선택) |
| 단어 고르기 | 태그 형태 배지 클릭 선택 |
| 미니 게임형 | 좌/우 스와이프 or 버튼 선택 |

**mock 질문 데이터 예시:**
```ts
// lib/mock/questions.ts
export const questions = [
  {
    id: 1,
    text: "자연 속에서 일하는 것에 끌리나요?",
    type: "image-select",
    options: ["숲", "드론", "지도", "캠핑", "구조 활동"],
  },
  ...
]
```

---

### 4. 해석 중간 화면 `/explore/interpreting`

**목적:** 몰입감 유지, 처리 중 인터랙션

**구성 요소:**
- 키워드 떠오르는 애니메이션 (Framer Motion)
- "네가 좋아하는 방향을 읽고 있어요..." 문구
- 수집된 키워드 시각화 (태그 클라우드)
- 2~3초 후 자동으로 결과 화면으로 이동

---

### 5. 결과 화면 `/explore/result`

**목적:** 페르소나 해석 결과 제시

**구성 요소:**
- 페르소나명 (크게, 임팩트 있게)
- 한 줄 소개
- 핵심 키워드 배지 (3~5개)
- 관련 분야 카드
- 추천 체험 부스 리스트
- 카드 발급 버튼 (→ `/explore/card`)

**mock 결과 데이터 예시:**
```ts
// lib/mock/personas.ts
export const mockResult = {
  name: "숲을 지키는 드론 전문가",
  tagline: "자연과 기술을 함께 활용해 생태를 지키는 미래형 탐사 역할",
  keywords: ["자연", "드론", "탐사", "기술", "보호"],
  fields: ["환경공학", "항공기술", "데이터 관측"],
  recommendedBooths: ["드론 체험", "환경/자연 체험", "안전/재난 기술"],
}
```

---

### 6. 카드 발급 화면 `/explore/card`

**목적:** 최종 페르소나 카드 생성 및 발급

**구성 요소:**
- 카드 앞면 미리보기 (페르소나명, 닉네임, 키워드, QR)
- 카드 뒷면 미리보기 (생성 이미지 자리, 어울리는 활동, 오늘의 미션)
- 앞/뒤 플립 애니메이션 (Framer Motion)
- 이미지 선택 또는 기본 이미지 사용
- 카드 저장/인쇄 버튼
- "내 페이지로 이동" 버튼 (→ `/profile/[id]`)

**카드 컴포넌트 구조:**
```
components/
└── card/
    ├── PersonaCard.tsx      # 카드 래퍼 (플립 컨테이너)
    ├── CardFront.tsx        # 앞면
    └── CardBack.tsx         # 뒷면
```

---

### 7. 개인 페이지 `/profile/[id]`

**목적:** 체험 이력, 배지, 리워드, 다음 추천 확인

**구성 요소:**
- 내 카드 미니 뷰
- 오늘의 기록 (방문 부스 리스트)
- 획득 배지 그리드
- 리워드 현황 (포인트)
- 추천 다음 체험 카드
- 행사 후 리포트 섹션

---

### 8. 운영자 로그인 `/operator`

**구성 요소:**
- ID/PW 입력 (shadcn Input, Form)
- 부스 선택 드롭다운
- 로그인 버튼 (→ `/operator/scan`)

**mock:** 어떤 값이든 로그인 성공

---

### 9. 운영자 스캔 화면 `/operator/scan`

**목적:** 학생 QR 스캔 및 방문 기록

**구성 요소:**
- QR 스캔 영역 (mock: "스캔 시뮬레이션" 버튼으로 대체)
- 스캔 결과: 학생 이름 + 페르소나명 표시
- 방문 등록 버튼
- 배지 지급 선택 (shadcn Select)
- → `/operator/done`

---

### 10. 기록 완료 화면 `/operator/done`

**구성 요소:**
- 등록 완료 메시지
- 누적 체험 수
- 다음 참가자 스캔 버튼

---

### 11. 관리자 대시보드 `/admin`

**구성 요소:**
- 실시간 수치 카드 (발급 수, 체험 수, 평균 부스 이동)
- 인기 키워드 바 차트 (Recharts 또는 shadcn chart)
- 혼잡 부스 현황 리스트
- 사이드바 네비게이션 (shadcn Sidebar)

---

## 컴포넌트 구조

```
components/
├── card/
│   ├── PersonaCard.tsx
│   ├── CardFront.tsx
│   └── CardBack.tsx
├── explore/
│   ├── QuestionCard.tsx
│   ├── ImageSelectGrid.tsx
│   ├── WordTagSelect.tsx
│   └── ProgressBar.tsx
├── profile/
│   ├── BadgeGrid.tsx
│   ├── BoothHistory.tsx
│   └── RewardStatus.tsx
├── operator/
│   ├── ScanArea.tsx
│   └── StudentInfo.tsx
├── admin/
│   ├── StatCard.tsx
│   ├── KeywordChart.tsx
│   └── BoothStatus.tsx
└── common/
    ├── Logo.tsx
    ├── NavBar.tsx
    └── PageTransition.tsx
```

---

## 전역 상태 (Zustand)

```ts
// store/useSessionStore.ts
interface SessionStore {
  inputMode: "chat" | "image" | "word" | "game" | null
  answers: Answer[]
  persona: PersonaResult | null
  cardId: string | null

  setInputMode: (mode: InputMode) => void
  addAnswer: (answer: Answer) => void
  setPersona: (persona: PersonaResult) => void
  setCardId: (id: string) => void
}
```

---

## mock 데이터 구조

```
lib/
└── mock/
    ├── questions.ts         # 모드별 질문 목록
    ├── personas.ts          # 페르소나 결과 샘플 (다수)
    ├── badges.ts            # 배지 정의
    ├── booths.ts            # 부스 목록 + 추천 매핑
    └── students.ts          # 운영자 스캔용 학생 샘플 데이터
```

---

## 개발 우선순위

### Phase 1 — 핵심 플로우 (학생용)
1. 웰컴 화면
2. 입력 방식 선택
3. 질문 진행 (이미지 선택 모드 우선)
4. 해석 중간 화면
5. 결과 화면
6. 카드 발급 + 카드 컴포넌트
7. 개인 페이지

### Phase 2 — 운영자 플로우
8. 운영자 로그인
9. QR 스캔 (mock)
10. 기록 완료 화면

### Phase 3 — 관리자 플로우
11. 관리자 대시보드
12. 콘텐츠 관리 화면
13. 결과 분석 화면

---

## 디자인 방향

- **톤:** 따뜻하고 몰입감 있는 UI. 검사지 느낌이 아닌 게임·탐험 감각
- **컬러:** 주조색 1~2개 + 중성 배경. 어둡지 않고 밝고 생동감 있게
- **타이포:** 한글 가독성 우선. 굵은 헤드라인으로 임팩트
- **애니메이션:** 질문 전환 슬라이드, 카드 플립, 키워드 등장 효과
- **반응형:** 태블릿 (1024px) 기준 우선 설계. 모바일 대응 포함

---

## 파일 네이밍 컨벤션

| 종류 | 규칙 | 예시 |
|---|---|---|
| 페이지 | `page.tsx` | `app/explore/page.tsx` |
| 컴포넌트 | PascalCase | `PersonaCard.tsx` |
| 훅 | camelCase, `use` 접두사 | `useSession.ts` |
| 스토어 | camelCase, `use` 접두사 | `useSessionStore.ts` |
| mock 데이터 | camelCase | `questions.ts` |
| 타입 | PascalCase, `types.ts` | `lib/types.ts` |

---

## 프로젝트 초기 세팅 순서

```bash
# 1. Next.js 프로젝트 생성
pnpm create next-app@latest i-be-frontend --typescript --tailwind --eslint --app --src-dir=false

# 2. shadcn/ui 초기화
pnpm dlx shadcn@latest init

# 3. 주요 shadcn 컴포넌트 추가
pnpm dlx shadcn@latest add button card input form checkbox select progress badge tabs sidebar

# 4. 추가 의존성 설치
pnpm add zustand framer-motion recharts

# 5. 디렉토리 구조 생성
mkdir -p app/{explore/{questions,interpreting,result,card},profile,operator/{scan,done},admin/{content,stats}}
mkdir -p components/{card,explore,profile,operator,admin,common}
mkdir -p lib/mock
```
