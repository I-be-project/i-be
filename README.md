# i-be — 나Be한마당 페르소나 카드 (monorepo)

AI 기반 진로 탐색 경험. 기존 3개 저장소(`backend`, `frontend`, `docs`)를
**커밋 히스토리를 보존한 채** 하나로 통합했다 (2026-07-01).

## 구성

| 디렉터리 | 설명 | 스택 |
|---|---|---|
| [`backend/`](backend/) | API 서버 (인증·세션·페르소나 생성·카드 파이프라인) | FastAPI · asyncpg(Postgres/Supabase) · S3 · OpenRouter |
| [`frontend/`](frontend/) | 학생 온보딩~페르소나 카드 발급 UI | Next.js 16 · TypeScript · Tailwind · Zustand |
| [`docs/`](docs/) | 가이드·이슈 기록·분석 문서 | Markdown |

각 서브프로젝트의 상세 실행 방법은 해당 디렉터리의 `README.md`를 참고한다.

## 문서

[`docs/README.md`](docs/README.md)가 전체 지도다. 폴더는 **수명**으로 나뉜다.

| 자주 보는 문서 | |
|---|---|
| [로컬 개발](docs/guides/development.md) | 개발 환경 구성 |
| [배포](docs/guides/deployment.md) | 배포·CD·운영 환경변수 |
| [운영 런북](docs/guides/operations.md) | 행사 중 장애 대응 |
| [이슈 기록](docs/issues/README.md) | 삽질·인프라 판단 기록 |

## 히스토리

`backend`(production), `frontend`(main), `docs`(main)의 전체 커밋 히스토리를
`git filter-repo`로 각 서브디렉터리 경로로 재작성해 병합했다.
특정 파일 이력은 `git log --follow -- <path>` 로 추적할 수 있다.
