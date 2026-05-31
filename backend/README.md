# nabe-backend

진로 내비게이터 백엔드 — FastAPI + Supabase Postgres + 인-프로세스 카드 생성 워커.

설계 문서: [`../docs/architecture/backend-design.md`](../docs/architecture/backend-design.md)

## 빠른 시작 (로컬)

```bash
# 1. 환경변수
cp .env.example .env

# 2. 의존성 설치
uv sync

# 3. 개발 서버 실행
uv run uvicorn app.main:app --reload
```

기본 주소: <http://localhost:8000>
- Swagger UI: <http://localhost:8000/docs>
- 헬스체크: <http://localhost:8000/healthz>

## Docker로 실행

```bash
docker compose up --build
```

## 디렉토리 구조

```
backend/
├── app/
│   ├── routers/         HTTP API 엔드포인트
│   ├── services/        비즈니스 로직
│   ├── repositories/    DB 접근
│   ├── adapters/        외부 시스템 (OpenRouter, Storage, DB pool)
│   ├── workers/         백그라운드 잡 워커
│   ├── schemas/         Pydantic Request/Response
│   └── core/            보안·예외·로깅·프롬프트
├── supabase/            마이그레이션·시드 (예정)
├── tests/
└── scripts/             시드·정리 스크립트
```

자세한 레이어 책임은 설계서 §5 참고.

## 명령어 모음

| 목적 | 명령 |
|---|---|
| 개발 서버 | `uv run uvicorn app.main:app --reload` |
| 테스트 | `uv run pytest` |
| 린트 | `uv run ruff check .` |
| 포맷 | `uv run ruff format .` |
| 타입체크 | `uv run mypy app` |

## 환경 분기

- `APP_ENV=local|staging|production` 으로 분기
- 모든 환경변수는 `.env.example` 참고
