# i-be frontend

나Be한마당 학생·운영진·관리자 UI. 프로젝트 소개는 [루트 README](../README.md).

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand ·
Framer Motion · Recharts. Vercel로 배포했다.

## 시작하기

```bash
cp .env.local.example .env.local   # 백엔드 주소 등
npm install
npm run dev      # http://localhost:4000
npm run lint
npm run build
npm test         # vitest
```

## 주요 경로

| 경로 | 대상 |
|---|---|
| `/signup` · `/login` | 가입·로그인 |
| `/explore` | 사진 → 설문 → 페르소나 선택 → 카드 발급 |
| `/(tabs)` | 완료 후 홈·부스·성향·프로필 탭 |
| `/b/[code]` | 부스 QR 진입 → 방문 인증 |
| `/p/[code]` | 공유용 개인 페이지 |
| `/operator` · `/admin` | 운영진·관리자 콘솔 (`components/console/` 공유) |
| `/dev` | 개발용 화면 |

전체 구조는 [아키텍처 문서](../docs/guides/architecture.md), 디자인 규칙은
[디자인 시스템](../docs/guides/design-system.md).
