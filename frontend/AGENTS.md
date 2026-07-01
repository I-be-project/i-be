<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Rules

## 필수 확인 사항

- 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 반드시 읽을 것
- Next.js 16 App Router 기반 — 학습 데이터와 API가 다를 수 있음
- shadcn/ui 컴포넌트 추가/수정 시 `components.json` 설정 확인 (style: base-nova)

## 기술 스택 규칙

### Next.js 16

- App Router 사용 (Pages Router 금지)
- 클라이언트 컴포넌트는 `"use client"` 선언 필수
- 서버 컴포넌트가 기본값 — 필요한 경우에만 클라이언트 전환
- 레이아웃: `layout.tsx`, 페이지: `page.tsx`

### TypeScript

- strict 모드 활성화
- 타입은 인터페이스(`interface`) 우선, 유니온/교차 타입이 필요한 경우 `type` 사용
- 경로 alias `@/*` 사용

### Tailwind CSS 4

- 유틸리티 클래스 직접 사용 (CSS 파일에 커스텀 클래스 추가 지양)
- 조건부 클래스: `cn()` 함수 사용 (`@/lib/utils`)
- 테마 변수는 `globals.css`에 OKLCH 색상 체계로 정의됨

### shadcn/ui

- 컴포넌트 위치: `components/ui/`
- 스타일: base-nova 프리셋
- 아이콘: Lucide React
- 새 컴포넌트 추가: `npx shadcn@latest add <component>`

### Zustand

- 스토어 위치: `store/`
- 네이밍: `use` 접두사 + `Store` 접미사 (예: `useSessionStore`)
- 불필요한 리렌더링 방지를 위해 selector 패턴 사용

### Framer Motion

- `motion` 컴포넌트로 애니메이션 적용
- 페이지 전환: slide + fade 조합
- 리스트: stagger container 패턴
- 인터랙션: spring 타입 선호

## 프로젝트 규칙

- UI 텍스트는 한국어로 작성
- mock 데이터는 `lib/mock/`에 위치
- 반응형 기준: 모바일 퍼스트 (768px 브레이크포인트)
- 기획 의도는 `docs/plan.md`, 기술 명세는 `docs/dev-plan.md` 참조
