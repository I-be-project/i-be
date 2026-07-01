# 나Be한마당 페르소나 카드

> **진로는 정답을 찾는 시험이 아니라, 나를 써 내려가는 서사다.**

2026 나Be한마당을 위한 AI 기반 페르소나 카드 진로 탐색 경험 프론트엔드입니다.
학생이 다양한 방식(대화, 이미지, 단어, 게임)으로 자신의 관심사와 취향을 탐색하고,
AI가 이를 해석하여 **미래 페르소나 카드**를 발급합니다.

## 기술 스택

| 항목 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript 5 |
| 스타일링 | Tailwind CSS 4 |
| UI 컴포넌트 | shadcn/ui (base-nova) |
| 상태 관리 | Zustand 5 |
| 애니메이션 | Framer Motion 12 |
| 차트 | Recharts 3 |
| 아이콘 | Lucide React |
| 폰트 | Pretendard Variable |

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start

# 린트 검사
npm run lint
```

## 프로젝트 구조

```
app/
├── page.tsx                          # 웰컴 (랜딩)
├── layout.tsx                        # 루트 레이아웃
├── globals.css                       # 글로벌 스타일 + 테마 변수
│
├── explore/                          # 학생용 탐색 플로우
│   ├── page.tsx                      # 입력 방식 선택
│   ├── questions/page.tsx            # 질문 진행
│   ├── interpreting/page.tsx         # 해석 중간 화면
│   ├── result/page.tsx               # 결과 화면
│   └── card/page.tsx                 # 카드 발급
│
├── profile/[id]/page.tsx             # 개인 페이지
├── operator/                         # 운영자용 (placeholder)
└── admin/                            # 관리자용 (placeholder)

components/
├── ui/                               # shadcn/ui 컴포넌트
└── card/
    └── PersonaCard.tsx               # 페르소나 카드 컴포넌트

store/
└── useSessionStore.ts                # Zustand 세션 상태 관리

hooks/
└── use-mobile.ts                     # 모바일 감지 훅

lib/
├── utils.ts                          # cn() 유틸리티
└── mock/
    ├── questions.ts                  # 모드별 mock 질문
    └── personas.ts                   # mock 페르소나 결과

docs/
├── plan.md                           # 프로젝트 기획안
└── dev-plan.md                       # 프론트엔드 개발 계획서
```

## 사용자 플로우

```
웰컴 → 입력 방식 선택 → 질문 진행 → 해석 중 → 결과 확인 → 카드 발급 → 개인 페이지
```

1. **웰컴** (`/`) — 행사 소개, 개인정보 동의
2. **입력 방식 선택** (`/explore`) — 대화 / 이미지 / 단어 / 게임 중 선택
3. **질문 진행** (`/explore/questions`) — 모드별 질문에 응답
4. **해석 중간 화면** (`/explore/interpreting`) — 키워드 애니메이션 + 로딩
5. **결과 화면** (`/explore/result`) — 페르소나명, 키워드, 관련 분야, 추천 부스
6. **카드 발급** (`/explore/card`) — 페르소나 카드 생성 및 저장
7. **개인 페이지** (`/profile/[id]`) — 체험 기록, 배지, 포인트, 추천

## 현재 상태

초기 프로토타입 단계로, 백엔드 연동 없이 **mock 데이터**로 전체 UX 흐름을 검증합니다.

- [x] 학생용 전체 플로우 (웰컴 ~ 개인 페이지)
- [ ] 운영자용 플로우 (QR 스캔 기반 기록)
- [ ] 관리자용 대시보드
- [ ] 실제 LLM API 연동
- [ ] 이미지 생성 연동
- [ ] QR 코드 생성 및 스캔
- [ ] DB / 인증 연동
