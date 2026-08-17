# 개발 가이드

로컬에서 개발할 때 보는 문서. 배포는 [`deployment.md`](deployment.md),
구조 전반은 [`architecture.md`](architecture.md) 참고.

## 구성

| 대상 | 스택 | 로컬 포트 |
|---|---|---|
| `frontend` | Next.js 16 | 4000 |
| `backend` | FastAPI + 워커 (uv) | 8000 |
| DB / 스토리지 | Supabase (로컬도 직접 연결) | — |
| AI | OpenRouter | — |

> Docker 관련 파일은 컨테이너화가 필요한 **`backend/`** 안에만 있다. 프론트는 Vercel이 자체 빌드하므로 Docker가 없다.

---

## 1. 백엔드

DB·스토리지는 로컬에서도 **Supabase를 직접** 쓴다(별도 postgres 컨테이너 없음). `.env`에 Supabase 연결 문자열을 넣는다.

**방법 A — uv 직접 실행 (빠른 반복, 권장)**
```bash
cd backend
cp .env.example .env      # 최초 1회, 값 채우기
uv sync                   # 의존성 설치
uv run uvicorn app.main:app --reload
```

**방법 B — Docker로 실행 (배포 환경과 동일하게 검증)**
```bash
cd backend
docker compose up --build      # docker-compose.yml, 코드 볼륨 마운트로 반영
```

확인:
- API: <http://localhost:8000>
- Swagger UI: <http://localhost:8000/docs>
- 헬스체크: <http://localhost:8000/healthz>

품질 명령:
| 목적 | 명령 |
|---|---|
| 테스트 | `uv run pytest` |
| 린트 | `uv run ruff check .` |
| 포맷 | `uv run ruff format .` |
| 타입체크 | `uv run mypy app` |

---

## 2. 프론트엔드

```bash
cd frontend
cp .env.local.example .env.local     # 최초 1회
npm install
npm run dev                          # http://localhost:4000
```

- 백엔드 주소는 `NEXT_PUBLIC_API_URL`로 지정한다 (로컬 기본값 `http://localhost:8000`).

품질 명령:

| 목적 | 명령 |
|---|---|
| 린트 | `npm run lint` |
| 빌드 | `npm run build` |
| 테스트 | `npm run test` (vitest) |

> 커밋·PR 전에 **`npm run lint`와 `npm run build`를 모두** 통과시킨다.
> 타입 오류는 `lint`가 아니라 `build`에서 잡힌다.

---

## 3. 프론트 ↔ 백엔드 함께 띄우기

터미널 2개로:
```bash
# 터미널 1
cd backend && uv run uvicorn app.main:app --reload   # :8000

# 터미널 2
cd frontend && npm run dev                            # :4000
```

> CORS: 백엔드 `.env`의 `FRONTEND_ORIGIN`에 프론트 주소(`http://localhost:4000`)를 넣어야 브라우저 호출이 통과한다.

---

## 4. 브랜치 흐름

| 브랜치 | 역할 |
|---|---|
| `production` | 배포 브랜치. **모든 PR의 base.** 직접 커밋 금지 |
| `develop` | 통합 브랜치. 일상 작업은 여기서 |
| `feat/*` `fix/*` `chore/*` `docs/*` | 독립 작업은 접두사 브랜치로 분리 |

```bash
git switch -c feat/<작업이름> develop
# ... 작업 + 커밋 ...
git push -u origin feat/<작업이름>
# PR 생성 (base: production) → 리뷰 → 머지
```

- **`production` 머지 = 배포 트리거.** `backend/**` 변경은 push 즉시 자동 재배포된다.
- 머지 전 변경한 서브프로젝트의 품질 게이트를 통과시킨다
  (백엔드 `ruff`·`mypy`·`pytest`, 프론트 `lint`·`build`).
- 커밋 메시지는 Conventional Commits 접두사 + 한국어. 자세한 규칙은 루트 `CLAUDE.md`.

---

## 5. 환경변수

| 위치 | 파일 | 비고 |
|---|---|---|
| 백엔드 | `backend/.env` | `.env.example` 참고, **git 커밋 금지** |
| 프론트 | `frontend/.env.local` | `.env.local.example` 참고, **git 커밋 금지** |

`.env` / `.env.local`은 `.gitignore`에 포함됨. 시크릿은 절대 커밋하지 않는다.

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-07-01 | 개발 가이드 v1 |
| 2026-08-15 | 브랜치 흐름을 `CLAUDE.md`(production/develop/접두사)와 일치시킴. 프론트 품질 명령에 `npm run build` 추가, `NEXT_PUBLIC_API_URL` 변수명 명시 |
