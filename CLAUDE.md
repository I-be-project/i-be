# 나Be한마당 — 모노레포 루트

AI 기반 진로 탐색 경험. 3개 저장소(`backend`·`frontend`·`docs`)를 커밋 히스토리를
보존한 채 하나로 통합한 모노레포. 하위 프로젝트별 상세 규칙은 각 폴더의 문서 참조.

| 디렉터리 | 설명 | 스택 | 상세 |
|---|---|---|---|
| `backend/` | API 서버 (인증·세션·페르소나·카드) | FastAPI · asyncpg(Postgres/Supabase) · S3 · OpenRouter | `backend/README.md` |
| `frontend/` | 학생 온보딩~카드 발급 UI | Next.js 16 · TypeScript · Tailwind · Zustand | `frontend/CLAUDE.md` |
| `docs/` | 설계서·계획·아키텍처 | Markdown | `docs/README.md` |

작업 시작 전 해당 서브프로젝트의 문서를 먼저 읽는다. 특정 파일 이력은 `git log --follow -- <path>`.

## Git / PR 규칙

### 브랜치 전략

- `production` — 배포 브랜치 (PR base). 직접 커밋 금지
- `develop` — 통합 브랜치. 일상 작업은 여기서 진행
- 독립 기능/문서/설정 작업은 접두사 브랜치로 분리: `feat/*`, `fix/*`, `chore/*`, `docs/*`
- 모든 PR의 base는 `production`

### 커밋 메시지

- Conventional Commits 접두사 + 한국어 설명: `feat:`, `fix:`, `chore:`, `docs:`, `design:`
- 예: `fix: 로그인 비밀번호 가이드를 4자리로 수정`
- 무엇을 왜 바꿨는지 한 줄로 명확하게

### PR

- 제목: 커밋 메시지와 동일한 컨벤션 (접두사 + 한국어). 여러 성격이 섞이면 대표 성격으로 요약
- 본문: `## 개요` + `## 변경 내용`(항목별 목록) 구성. UI 문구 변경은 before → after로 표기
- 생성 전 `git log origin/production..origin/develop`로 포함될 커밋 확인, 동일 base/head의 열린 PR 중복 여부 체크
- base는 항상 `production`
- 커밋 메시지·PR 본문에 `🤖 Generated with Claude Code` 등 자동 생성 푸터/서명 넣지 않기

## 배포 규칙

- **`production` 머지 = 배포 트리거.** production으로 향하는 PR은 배포 가능한 상태에서만 머지한다.
- `backend/**` 변경이 `production`에 push되면 GitHub Actions가 서버에 SSH로 자동 재배포한다
  (`.github/workflows/deploy-backend.yml`). 헬스체크: `https://api.cnu-likelion.kr/healthz`
- 서버 저장소는 `git reset --hard origin/production`로 강제 동기화되므로 **서버에서 코드를 직접 수정하지 않는다.**
- 배포 상세·수동 폴백은 `DEPLOYMENT.md`, 로컬 개발은 `DEVELOPMENT.md` 참조.

## 환경변수 / 시크릿

- `.env` 계열은 **절대 git에 커밋하지 않는다** (`.gitignore` 확인). 예시는 `.env.example`로만 공유.
- 백엔드 운영 시크릿(`SUPABASE_SERVICE_KEY`, `JWT_SECRET` 등)은 서버의 `backend/.env`에만 둔다.
- 배포/CI 시크릿(`SSH_KEY` 등)은 GitHub Secrets에만 둔다. 코드·문서·로그에 값을 노출하지 않는다.

## 문서 규칙

- 설계·아키텍처·분석 문서는 `docs/`에 `YYYY-MM-DD-주제.md` 형식으로 작성 (기존 파일 네이밍 준수).
- 날짜는 절대 표기, 상대 표현("어제") 금지.
- 배포/개발 가이드(`DEPLOYMENT.md`·`DEVELOPMENT.md`)는 동작이 바뀌면 함께 갱신하고 하단 변경 이력에 추가.

## 코드 품질 게이트

커밋/PR 전에 **변경한 서브프로젝트**의 검증을 통과시킨다. 실패를 남긴 채 push하지 않는다.

- **frontend**: `npm run lint` + `npm run build`
- **backend**: `uv run ruff check .` + `uv run ruff format --check .` + `uv run mypy app` + `uv run pytest`
- 백엔드는 mypy `strict` 기준 — 타입 무시(`# type: ignore`)는 사유를 주석으로 남긴다.
- 동작이 바뀌는 백엔드 변경은 `tests/`에 대응 테스트를 추가/갱신한다 (라우터·서비스 단위 테스트 관례 유지).

## 의존성 관리

- **backend**: `uv`로만 관리. 추가는 `uv add`, 실행은 `uv run`. `uv.lock`을 함께 커밋한다.
- **frontend**: `npm`으로 관리. `package-lock.json`을 함께 커밋한다.
- 락파일 없이 의존성만 바꾸거나, 전역(global) 설치에 의존하는 코드를 만들지 않는다.
- 버전 고정에 특별한 이유가 있으면 해당 라인에 주석으로 근거를 남긴다 (예: `bcrypt<5` 고정 사유).

## 변경 범위

- 하나의 커밋/PR은 가급적 한 서브프로젝트(`backend`/`frontend`/`docs`)에 국한한다.
- 부득이 여러 프로젝트를 함께 바꾸면 PR 본문에 프로젝트별로 변경 내용을 나눠 적고, 배포 영향(특히 `backend/**` → 자동 배포)을 명시한다.

## 언어

- 커밋 메시지·PR·문서·UI 텍스트 모두 한국어로 작성.
