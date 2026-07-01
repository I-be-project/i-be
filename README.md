# i-be — 나Be한마당 페르소나 카드 (monorepo)

AI 기반 진로 탐색 경험. 기존 3개 저장소(`backend`, `frontend`, `docs`)를
**커밋 히스토리를 보존한 채** 하나로 통합했다 (2026-07-01).

## 구성

| 디렉터리 | 설명 | 스택 |
|---|---|---|
| [`backend/`](backend/) | API 서버 (인증·세션·페르소나 생성·카드 파이프라인) | FastAPI · asyncpg(Postgres/Supabase) · S3 · OpenRouter |
| [`frontend/`](frontend/) | 학생 온보딩~페르소나 카드 발급 UI | Next.js 16 · TypeScript · Tailwind · Zustand |
| [`docs/`](docs/) | 설계서·계획·아키텍처 문서 | Markdown |

각 서브프로젝트의 상세 실행 방법은 해당 디렉터리의 `README.md`를 참고한다.

## 히스토리

`backend`(production), `frontend`(main), `docs`(main)의 전체 커밋 히스토리를
`git filter-repo`로 각 서브디렉터리 경로로 재작성해 병합했다.
특정 파일 이력은 `git log --follow -- <path>` 로 추적할 수 있다.
