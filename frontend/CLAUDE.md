@AGENTS.md

# 프로젝트 개요

나Be한마당 페르소나 카드 — AI 기반 진로 탐색 경험 프론트엔드.
Next.js 16 App Router + TypeScript + Tailwind CSS 4 + shadcn/ui + Zustand + Framer Motion.

## 명령어

```bash
npm run dev       # 개발 서버
npm run build     # 프로덕션 빌드
npm run lint      # ESLint 검사
npm start         # 프로덕션 서버
```

## 코드 컨벤션

### 파일 네이밍

- 페이지: `page.tsx` (Next.js App Router 규칙)
- 컴포넌트: PascalCase (`PersonaCard.tsx`)
- 훅: camelCase, `use` 접두사 (`useSessionStore.ts`, `use-mobile.ts`)
- mock 데이터: camelCase (`questions.ts`, `personas.ts`)

### 경로 alias

- `@/*` → 프로젝트 루트 (tsconfig.json에 정의)
- 예: `@/components/ui/button`, `@/lib/utils`, `@/store/useSessionStore`

### 스타일링

- Tailwind CSS 4 유틸리티 클래스 사용
- 조건부 클래스 결합: `cn()` (`lib/utils.ts` — clsx + tailwind-merge)
- 테마 색상: `globals.css`에 OKLCH 기반 CSS 변수로 정의
- shadcn/ui 컴포넌트 스타일: base-nova 프리셋, neutral 베이스 컬러

### 컴포넌트

- shadcn/ui 컴포넌트는 `components/ui/`에 위치
- 커스텀 컴포넌트는 기능별 폴더 (`components/card/` 등)
- 클라이언트 컴포넌트는 파일 최상단에 `"use client"` 선언
- 아이콘은 Lucide React 사용

### 상태 관리

- Zustand로 세션 상태 관리 (`store/useSessionStore.ts`)
- 현재 mock 전용, 영속성 없음

### 애니메이션

- Framer Motion 사용 (`motion` 컴포넌트)
- 패턴: stagger container, spring scale, slide + fade 전환

## 아키텍처

### 라우팅

```
/                           웰컴 (랜딩)
/explore                    입력 방식 선택
/explore/questions          질문 진행
/explore/interpreting       해석 중간 화면
/explore/result             결과 화면
/explore/card               카드 발급
/profile/[id]               개인 페이지
/operator/*                 운영자용 (미구현)
/admin/*                    관리자용 (미구현)
```

### 데이터 흐름

입력 방식 선택 → 모드별 질문 응답 → Zustand에 저장 → mock 페르소나 결과 표시 → 카드 생성

### 현재 상태

초기 프로토타입. 백엔드 없이 mock 데이터로 UX 검증 중.
`lib/mock/`에 질문과 페르소나 샘플 데이터 존재.

## 주의사항

- UI 텍스트는 한국어
- 반응형: 모바일 퍼스트 (768px 브레이크포인트, `hooks/use-mobile.ts`)
- Pretendard Variable 폰트 사용 (CDN으로 로드)
- 기획 의도 참고: `docs/plan.md`, 기술 명세: `docs/dev-plan.md`
