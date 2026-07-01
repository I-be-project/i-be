# 진로 내비게이터 — 백엔드 설계서

> 본 문서는 나Be한마당 페르소나 카드(진로 내비게이터) 프로젝트의 **백엔드 시스템 설계 종합 문서**다. 프로젝트 비전과 UX 의도는 `../product/01-vision.md`(원본: `frontend/docs/plan.md`)를 참고한다. 본 문서는 그 비전을 **현실의 시스템 컴포넌트로 어떻게 구현할 것인가**를 다룬다.

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-31 |
| 상태 | Draft — 팀 검토 전 |
| 적용 대상 | `backend` 레포 |
| 관련 레포 | `frontend`, `backend`, `docs` |

---

## 0. 문서 사용법

- **결정 사항**은 본문에 기록하고, 그 배경/대안/근거는 `../decisions/` ADR 문서로 분리한다(향후 작성).
- 본문에서 `→ ADR-0003`처럼 ADR을 참조한다(파일은 추후 분할 시 생성).
- 본 문서는 **단일 진실의 출발점**이며, 합의 후 섹션별로 `architecture/02-data-model.md` 등으로 분할할 계획이다.

---

## 1. 프로젝트 개요와 시스템의 책임

**진로 내비게이터**는 학생이 AI와 상호작용하며 자신의 관심/감각을 미래 페르소나 카드로 발급받고, 행사장에서 추천 부스를 체험하며 본인 페이지에서 기록을 누적하는 **참여형 진로 경험 시스템**이다(상세: `product/01-vision.md`).

백엔드 시스템의 책임은 다음과 같다.

1. **학생 식별과 세션 관리** — 닉네임 기반 익명 식별, 카드 QR 영구 토큰 발급
2. **질문/응답 흐름 처리** — Q1~Q10 단계별 답변 저장, 적응형 질문(Q7~9, Q10) 동적 생성
3. **AI 오케스트레이션** — 응답 해석, 페르소나 생성, 이미지 프롬프트 작성, 이미지 합성
4. **카드 발급과 영구 저장** — 페르소나 결과·생성 이미지를 묶어 카드로 보존
5. **부스 운영자 인증과 리워드 적립** — QR 스캔 기반 방문 기록, 운영자 권한 분리
6. **관리자 대시보드 데이터** — 발급 현황·키워드 통계·부스별 체험률
7. **개인정보 보호 정책 강제** — 사진 즉시 폐기, 학생 삭제 요청 처리, 권한 격리

---

## 2. 운영 컨텍스트와 제약

| 항목 | 결정 |
|---|---|
| 운영 형태 | **1회성 행사** (수백~수천명/일) |
| 피크 부하 | 동시 사용자 수백명, 1분당 카드 생성 요청 최대 ~100건 시나리오까지 가정 |
| 학생 체류시간 | 행사장 안에서 카드 발급은 5~10분 사이 완료되어야 함 |
| 행사 후 운영 | 결과는 **영구 보관**, 학생이 본인 페이지에서 조회 계속 가능 |
| 운영 인력 | 행사 당일 백엔드 담당자가 모니터링 가능. 평시엔 자율 운영 |
| 비용 제약 | 행사 1일 + 평시 보관용. 행사 직전·당일만 스케일 업, 이후 다운 |

→ 이 제약에서 **단순성 > 유연성 > 확장성** 순으로 가중치를 둔다. 행사 1일을 견디는 게 1순위.

---

## 3. 기술 스택 결정 요약

| 영역 | 선택 | 근거 요약 |
|---|---|---|
| 언어/프레임워크 | **Python + FastAPI** | 팀 선호. AI 호출 단순 순차 호출이라 LangChain 같은 도구 불필요. asyncio 기반 I/O 비동기에 적합 |
| 패키지/실행 | **uv** (또는 Poetry), `uvicorn` | 빠른 의존성 해석, Docker 친화적 |
| DB | **Supabase Postgres** | Postgres + Storage + Realtime + RLS 통합. 1회성 행사 운영 부담 최소 |
| 객체 스토리지 | **Supabase Storage** | DB와 같은 RLS 정책으로 묶임. Signed URL 발급 내장 |
| AI 게이트웨이 | **OpenRouter** (또는 직접 OpenAI) | 모델 교체 유연성, 텍스트는 자동 폴백. 이미지는 백엔드 프로바이더 의존 |
| 인증 | **JWT** (학생/운영자/관리자 3종) | 무상태, 클라이언트 보관 가능 |
| 마이그레이션 | **Supabase CLI migrations** (또는 Alembic) | DB 스키마 버전 관리 |
| 배포 | **Render / Fly.io / Railway 중 택1** | FastAPI 모놀리스 1개 인스턴스 |
| 컨테이너 | **Docker + docker-compose** | 로컬 개발 환경 동일성 |
| 프론트엔드 | Next.js 16 (별도 레포) | 기존 구성 유지 |

자세한 비교와 대안은 향후 ADR-0001~0006에 기록한다.

---

## 4. 전체 시스템 아키텍처 (확정안: 모놀리스 A)

```
┌────────────────────────────────────────────────────────────────┐
│  Next.js 16 (Vercel)                                            │
│    - 학생 UI, 운영자 스캐너, 관리자 대시보드                    │
│    - 카드 미리보기, QR 표시/스캔                                │
└──────────────────┬─────────────────────────────────────────────┘
                   │ HTTPS · JSON · JWT (Authorization)
                   ▼
┌────────────────────────────────────────────────────────────────┐
│  FastAPI 모놀리스 (Render / Fly.io · 인스턴스 1~2개)            │
│                                                                  │
│  ┌─────────────────── HTTP API Layer ─────────────────────────┐ │
│  │  Routers:                                                   │ │
│  │    /api/auth/*        학생 등록, 세션 발급                  │ │
│  │    /api/sessions/*    답변 저장, 다음 질문 (짧은 AI 동기)   │ │
│  │    /api/cards/*       카드 생성 잡 큐잉, 폴링, 조회         │ │
│  │    /api/operator/*    운영자 로그인, QR 스캔, 적립          │ │
│  │    /api/admin/*       대시보드, 통계, 운영자 관리            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─────────────────── Service Layer ──────────────────────────┐ │
│  │  SessionService · CardService · AIService · RewardService  │ │
│  │  AuthService · OperatorService · AdminService              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─────────────────── Repository Layer ───────────────────────┐ │
│  │  StudentRepo · SessionRepo · AnswerRepo · PersonaRepo      │ │
│  │  CardRepo · BoothRepo · RewardRepo · JobRepo · AuditRepo   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌─────────────────── Adapter Layer ──────────────────────────┐ │
│  │  AIClient (OpenRouter)   StorageClient (Supabase)          │ │
│  │  DBPool (asyncpg)        SecurityProvider (JWT)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────── Background Worker (asyncio task) ──────────────┐ │
│  │  card_worker_loop():                                       │ │
│  │    poll jobs.pending → claim → CardService.run_generation  │ │
│  │    → AI-04 → AI-05 → IMG-01,02 (parallel) → save → mark    │ │
│  │  세마포어로 동시성 제한 (CARD_WORKER_CONCURRENCY)          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────┬───────────────────────────┬─────────────────────┘
               ▼                           ▼
   ┌──────────────────────┐    ┌────────────────────────────┐
   │ Supabase Postgres    │    │ Supabase Storage           │
   │                      │    │  photos/   (private)       │
   │  schemas:            │    │  cards/    (signed URL)    │
   │   pii                │    └────────────────────────────┘
   │   generated          │
   │   rewards            │    ┌────────────────────────────┐
   │   ops                │    │ OpenRouter (또는 OpenAI)   │
   └──────────────────────┘    │  gpt-5-mini, gpt-5.2,      │
                                │  gpt-image-1.5 …           │
                                └────────────────────────────┘
```

**핵심 결정 요약**:
- API 핸들러와 백그라운드 워커가 **같은 프로세스, 같은 asyncio 이벤트 루프**에서 동작 (인-프로세스 워커 패턴).
- AI 호출은 짧은 것(텍스트, 수 초)은 **HTTP 핸들러 안에서 동기 처리**, 긴 것(`/generating` 흐름의 4단계)은 **`jobs` 테이블 + 폴링 워커**로 분리.
- DB 접근은 모두 Repository 레이어를 통하고, 외부 시스템(OpenRouter, Supabase Storage)은 Adapter로 추상화.

---

## 5. 컴포넌트 구조 (레이어드 아키텍처)

### 5.1 레이어 책임

| 레이어 | 책임 | 포함하는 것 / 포함하지 않는 것 |
|---|---|---|
| **Router** | HTTP 요청/응답 직렬화, 인증 검증, 입력 검증, Service 호출 | DB 직접 접근·AI 직접 호출 금지 |
| **Service** | 비즈니스 규칙·트랜잭션·여러 Repo 조합 | HTTP 객체·Pydantic Request 모델 의존 금지 |
| **Repository** | DB 쿼리·트랜잭션 경계 | 비즈니스 규칙 금지 |
| **Adapter** | 외부 시스템(OpenRouter, Storage) 호출, 재시도/타임아웃/세마포어 | 도메인 지식 금지 |
| **Worker** | 잡 큐 폴링, 잡 라이프사이클 관리. 실제 작업은 Service를 호출 | 자체 비즈니스 로직 가지지 않음 |

### 5.2 디렉토리 구조 (개념)

> 레이어별 책임을 명확히 분리하는 패턴까지만 정한다. 구체 파일명·분할 단위는 구현 단계에서 결정한다.

```
backend/
├── (프로젝트 설정 파일: pyproject.toml, Dockerfile, docker-compose, .env.example 등)
├── supabase/                   # 마이그레이션·시드 (Supabase CLI 또는 Alembic)
├── app/
│   ├── routers/                # Router (HTTP API 진입점)
│   ├── services/               # Service (비즈니스 로직, 트랜잭션 경계)
│   ├── repositories/           # Repository (DB 접근)
│   ├── adapters/               # Adapter (OpenRouter, Storage 등 외부 시스템)
│   ├── workers/                # Worker (잡 큐 폴링 루프)
│   ├── schemas/                # Pydantic Request/Response 모델
│   └── core/                   # 공통: 보안, 예외, 로깅, 프롬프트 템플릿
├── tests/
└── scripts/                    # 시드 / 행사 종료 후 정리 / 운영 보조
```

**규칙:**
- 한 레이어는 자기 책임 안에서만 동작 (§5.1 의존성 규칙)
- 모듈 분할 단위는 도메인 영역별 (auth / session / card / operator / admin / reward 등)이 자연스러운 시작점. 같은 영역 안에서 더 잘게 쪼갤지는 코드 양에 따라 구현 시 판단.

### 5.3 의존성 흐름 규칙

```
Router → Service → Repository → DB
              ↓
              → Adapter → External (OpenRouter, Storage)
```

- 역방향 금지: Repository가 Service를 부르지 않는다.
- 같은 레이어 내 호출은 허용 (예: `CardService.run_generation`이 `AIService.create_persona`를 부름).
- Adapter는 어느 Service에서나 호출 가능하지만, **Adapter가 Service에 의존하지 않는다**.

---

## 6. 데이터 모델 (개념 수준)

> 본 섹션은 **무엇을 저장하고 어떻게 권한을 분리하는가**까지만 다룬다. 구체 컬럼·타입·제약·인덱스는 구현 단계에서 마이그레이션 PR로 확정한다. 본 설계서는 그 결정을 미리 못 박지 않는다.

### 6.1 스키마 분리

물리적으로 **Postgres 1개**, 논리적으로 **schema 4개**로 책임과 권한을 나눈다.

| Schema | 책임 | 주 접근자 |
|---|---|---|
| `pii` | 학생 원본(닉네임, 사진 경로, 동의 플래그) — 설계도의 DB1 | 학생 본인 / 관리자 |
| `generated` | 세션·답변·페르소나·카드·공유 토큰 — 설계도의 DB2 | 학생 본인 / 관리자 / 운영자(제한 컬럼) |
| `rewards` | 부스·운영자·리워드 규칙·로그 — 설계도의 DB3 | 학생(자기 적립) / 운영자(자기 부스) / 관리자 |
| `ops` | 잡 큐·감사 로그 (공용 운영 데이터) | 시스템 / 관리자 |

분리 이유:
- **권한을 schema 단위로 강제**할 수 있음 (Supabase RLS / Postgres GRANT)
- PII가 다른 데이터와 같은 namespace에 섞이지 않음
- 운영자 토큰이 학생 PII에 **구조적으로 접근 불가**하게 강제

### 6.2 핵심 엔티티의 책임

각 엔티티가 **무엇을 위해 존재하는지**까지만 기술한다. 컬럼 구성은 구현 단계 결정.

**pii 스키마**
- `students` — 학생 1명을 식별하는 행. 닉네임·동의 플래그·사진 경로를 보관. 사진은 폐기 시 경로만 null 처리.

**generated 스키마**
- `sessions` — 한 학생이 카드를 만들기 위해 시작한 시도 1회. 상태 머신을 가짐(진행/생성중/완료/실패).
- `answers` — 세션 안의 Q1~Q10 응답. 적응형 질문(Q7~10)은 AI가 동적 생성하므로 **질문 문장 자체도 저장**해야 한다.
- `personas` — AI가 산출한 페르소나 결과(타이틀·요약·키워드·이미지 프롬프트 등). 세션과 1:1.
- `cards` — 발급된 카드. 페르소나와 이미지 경로·QR에 들어갈 영구 토큰을 포함.
- `share_links` — 부모/친구 공유용 **단기** 토큰. 만료시간 있음.

**rewards 스키마**
- `booths` — 부스 마스터.
- `operators` — 운영자 계정 (`booth_operator` 또는 `admin` 역할).
- `reward_rules` — 적립 규칙 정의 (포인트/배지, 적용 부스 범위).
- `reward_logs` — 적립 이력. **source of truth** (설계도 명시). 누가 어느 부스에 어떤 규칙으로 언제 적립했는지의 단일 기준.

**ops 스키마**
- `jobs` — 비동기 작업 큐 (현재는 `generate_card` 1종, 향후 확장 가능).
- `audit_logs` — 운영자·관리자 액션 보안 로그.

### 6.3 엔티티 관계 개념도

```
[students] ──< [sessions] ──< [answers]
     │             │
     │             └─< [personas]
     │                     │
     │                     └─< [cards] ──< [share_links]
     │                              │
     │                              └─< [reward_logs] >─ [booths]
     │                                                  >─ [operators]
     │                                                  >─ [reward_rules]
     │
     └ (학생 단위 집계는 reward_logs의 denormalized 키로)

[jobs]    [audit_logs]
```

### 6.4 권한 매트릭스 (개념)

| 영역 | 학생 | 운영자 | 관리자 |
|---|---|---|---|
| `pii.*` | 본인만 R/U/D | ❌ | 전체 |
| `generated.*` | 본인만 | 카드 제한 컬럼만 R | 전체 |
| `rewards.reward_logs` | 본인 R | 자기 부스 R+I | 전체 |
| `rewards.operators` | ❌ | 본인 R | 전체 |
| `ops.*` | ❌ (API 우회만) | ❌ | R |

운영자가 카드 QR을 스캔할 때 보이는 정보는 **닉네임 + 페르소나 타이틀** 수준으로 제한한다. 학교·학년·동의 플래그 등 PII 컬럼은 운영자 토큰으로 조회 불가.

### 6.5 데이터 vs 파일 분리

- 구조화된 데이터(관계·트랜잭션 필요): **Postgres**
- 가변 구조 데이터(답변 페이로드·원본 AI 응답·메타데이터): **Postgres의 jsonb 컬럼** (NoSQL 별도 사용 안 함)
- 이미지·사진 바이너리: **Supabase Storage**, DB엔 경로만 보관. 접근은 Signed URL.
  - `photos/` — 학생 얼굴 원본 (private). 카드 생성 후 기본 폐기, 동의 시 30일 보관.
  - `cards/` — 생성 이미지(IMG-01, IMG-02). 영구 보관.

### 6.6 구현 단계에서 결정할 항목 (이 설계서에서 못 박지 않음)

- 컬럼명·타입·NOT NULL/DEFAULT 정책
- 외래키의 ON DELETE 정책
- 인덱스 (어떤 쿼리 패턴에 어떤 인덱스를 걸지)
- 중복 방지를 위한 UNIQUE 제약 위치 (예: 같은 부스 재방문 처리 정책)
- 카드 재발급 정책 (같은 학생이 새 세션 시작 가능 여부)
- 응답 페이로드의 jsonb 스키마 (모드별 형태)
- 마이그레이션 분할 단위와 순서

---

## 7. AI 오케스트레이션

### 7.1 호출 순서와 사용자 인터리브

```
[학생 입력 Q1~Q6]
       │
       ▼
[AI-01 응답 해석 (gpt-5-mini)]  ──→ [AI-02 Q7~Q9 생성 (gpt-5-mini)]
       │                                    │
       │  ◀── HTTP 동기 응답 (대기 5~15초) ──│
       ▼
[학생 입력 Q7~Q9]
       │
       ▼
[AI-03 Q10 생성 (gpt-5-mini/5.2)]
       │
       │  ◀── HTTP 동기 응답 (대기 3~8초)
       ▼
[학생 입력 Q10]
       │
       ▼
─────────── /api/cards/generate 진입 ────────────
       │                jobs.insert(type='generate_card') → job_id 반환
       ▼
[프론트: /generating 화면, GET /api/cards/jobs/{id} 폴링 2초 간격]
       │
       ▼ (백그라운드 워커)
[AI-04 페르소나 생성 (gpt-5.2)]
       │
       ▼
[AI-05 이미지 프롬프트 생성 (gpt-5-mini)]
       │
       ▼
[IMG-01 미래 프로필 (gpt-image-1.5)]  ‖  [IMG-02 직업 배경 (gpt-image-1.5)]   ← 병렬
       │                                              │
       └──────────────────────┬───────────────────────┘
                              ▼
                  [generated.cards INSERT + share_token 발급]
                              │
                              ▼
                  [job.status = 'done', result에 card_id 기록]
                              │
                              ▼
                  [프론트 폴링이 done 감지 → /result-card로 이동]
```

### 7.2 동기/비동기 경계

| 호출 | 처리 방식 | 이유 |
|---|---|---|
| AI-01 (응답 해석) | **HTTP 동기** (POST `/api/sessions/{id}/answers` 안에서 await) | 짧음(5~10초), 학생이 화면 앞에 있음 |
| AI-02 (Q7~Q9 생성) | **HTTP 동기** | AI-01과 같은 요청 안에서 묶어 처리 |
| AI-03 (Q10 생성) | **HTTP 동기** | 짧음(3~8초) |
| AI-04 + AI-05 + IMG-01,02 | **비동기 큐 + 폴링** | 총 30~60초. HTTP timeout 위험 + 학생 새로고침 대비 |

### 7.3 AI 어댑터 설계 (purpose-based)

코드는 모델명을 직접 부르지 않고, **목적(purpose)** 으로만 부른다. 매핑은 환경변수로.

```python
class AIClient:
    def __init__(self, base_url, api_key, model_map):
        self.client = openai.AsyncOpenAI(base_url=base_url, api_key=api_key)
        self.model_map = model_map  # {"analyze": "openai/gpt-5-mini", ...}
        self.image_sem = asyncio.Semaphore(int(os.getenv("IMAGE_CONCURRENCY", "10")))

    async def chat(self, purpose: str, messages, **kwargs):
        return await self.client.chat.completions.create(
            model=self.model_map[purpose], messages=messages, **kwargs,
        )

    async def generate_image(self, purpose: str, prompt):
        async with self.image_sem:
            return await self.client.images.generate(
                model=self.model_map[purpose], prompt=prompt,
            )
```

환경변수 예시:
```
AI_PROVIDER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=sk-or-...

AI_MODEL_ANALYZE=openai/gpt-5-mini
AI_MODEL_ADAPTIVE_QUESTIONS=openai/gpt-5-mini
AI_MODEL_FINAL_QUESTION=openai/gpt-5.2
AI_MODEL_PERSONA=openai/gpt-5.2
AI_MODEL_IMAGE_PROMPT=openai/gpt-5-mini
AI_MODEL_PORTRAIT_IMAGE=openai/gpt-image-1.5
AI_MODEL_WORLD_IMAGE=openai/gpt-image-1.5

IMAGE_CONCURRENCY=10
```

### 7.4 프롬프트 관리

- `app/core/prompts/` 디렉토리에 **목적별 1파일**.
- 입력 변수는 dataclass/TypedDict로 명확화.
- 모델 버전과 프롬프트 버전을 `personas.model_versions`에 기록 → 재현 가능성 확보.

### 7.5 안전장치

- **결과 검증**: 페르소나 title 길이, keywords 개수, 금칙어 등 후처리 검증. 실패 시 재시도 또는 fallback 페르소나.
- **금지 표현 필터**: 직업 단정형 표현, 부정적 표현 금지(plan.md §18 리스크1).
- **이미지 안전성**: 학생 얼굴이 들어간 이미지에 대한 ID 직접 노출 안 함 (Signed URL).

---

## 8. 인증과 인가

### 8.1 토큰 종류

| 종류 | 용도 | 만료 | claim |
|---|---|---|---|
| **학생 세션 토큰** | 질문 진행 중 API 호출 | 6시간 | `sub=student_id`, `kind=student`, `session_id` |
| **카드 공유 토큰** (영구) | QR 코드에 인코딩, 본인 페이지/공유 페이지 진입 | **무기한** (revoke 시 차단) | `card_id`, `kind=card_share`, signing key 분리 |
| **단기 공유 토큰** | 부모/친구 공유용 | 24시간 (설정 가능) | `card_id`, `kind=share_link`, `expires_at` |
| **운영자 세션 토큰** | 부스 운영자 API | 12시간 | `sub=operator_id`, `kind=operator`, `booth_id` |
| **관리자 세션 토큰** | 관리자 API | 12시간 | `sub=operator_id`, `kind=admin` |

### 8.2 학생 인증 흐름

1. `/login` 화면: 닉네임 + (옵션) 학교/학년 + 동의 + 사진 업로드
2. `POST /api/auth/register` → `pii.students` INSERT + 사진을 Storage에 업로드 + 학생 세션 토큰 반환
3. 이후 질문/답변 API에 토큰 첨부
4. 카드 발급 완료 → `share_token`을 카드 QR에 인코딩 → 학생은 QR로 본인 페이지 재진입

### 8.3 운영자 인증 흐름

1. `/operator` 로그인: login_id + password (bcrypt 검증)
2. 인증 성공 → 운영자 세션 토큰 발급(`booth_id` 포함)
3. `/operator/scan`에서 카드 QR 스캔 → `share_token` 해석 → `card_id` 추출 → 닉네임·페르소나 타이틀 표시
4. `/operator/reward`에서 적립 → `rewards.reward_logs` INSERT (자기 booth만 허용)

### 8.4 권한 가드 구현

- FastAPI `Depends`로 `current_student`, `current_operator`, `current_admin` 의존성 제공.
- Repository는 `actor` 객체를 받아 RLS 정책에 따라 쿼리 분기.
- 모든 운영자/관리자 액션은 `ops.audit_logs`에 기록.

---

## 9. 백그라운드 잡 큐와 워커

### 9.1 패턴 요약

- **인-프로세스 워커**: FastAPI `lifespan`에서 `asyncio.create_task(card_worker_loop())`로 띄움. 같은 프로세스, 같은 이벤트 루프.
- **DB 폴링**: 워커가 1초마다 `ops.jobs`에서 `status='pending'`을 `SELECT ... FOR UPDATE SKIP LOCKED`로 claim.
- **동시성 제한**: `asyncio.Semaphore`로 동시 진행 잡 수를 N으로 제한 (`CARD_WORKER_CONCURRENCY`, 기본 10).
- **fire-and-forget**: 잡 claim 후 `asyncio.create_task`로 처리 시작, 워커 루프는 다음 잡으로 즉시 이동.

### 9.2 잡 라이프사이클

```
[INSERT pending]
       │
       ▼
[Worker SELECT ... FOR UPDATE SKIP LOCKED]
       │
       ├─→ claim: UPDATE status='processing', claimed_by, claimed_at
       │
       ▼
[CardService.run_generation(job)]
       │
       ├─ 성공 → UPDATE status='done', result, finished_at
       │
       └─ 실패 → retry_count++
                 ├─ retry_count < max_retries: UPDATE status='pending' (즉시 재시도 가능)
                 └─ 초과: UPDATE status='failed', error_message
```

### 9.3 안전장치

- **Stuck job 회수**: 시작 시 `status='processing' AND claimed_at < now() - interval '10 minutes'`인 잡을 `pending`으로 되돌림.
- **Idempotency**: 같은 session_id에 대해 카드가 이미 있으면 중복 생성하지 않음(`generated.cards.persona_id UNIQUE`).
- **백프레셔**: 큐 길이가 임계치 초과 시 `/api/cards/generate`가 429 반환 (행사 운영 안전장치).

### 9.4 부하 시나리오와 처리력

| 시나리오 | 처리력 (워커 1개, 동시성 10) |
|---|---|
| 평시 (분당 5~10명) | 큐 거의 없음, 카드 발급 1~2분 |
| 피크 (분당 33명, 행사장 점심시간) | 큐 길이 ~10, 대기 평균 2~3분 |
| 버스트 (100명/분 일시) | 큐 90까지 쌓임, 마지막 학생 대기 9~10분 |

→ 버스트가 잦으면 `CARD_WORKER_CONCURRENCY`를 20~30으로 올리거나 워커 프로세스 추가(모놀리스 A → B 마이그레이션). 단, OpenAI 이미지 모델 rate limit이 진짜 상한.

---

## 10. 개인정보·데이터 보존 정책

### 10.1 데이터별 보존 정책 (느슨 모드)

| 데이터 | 보존 기간 | 위치 | 비고 |
|---|---|---|---|
| 얼굴 사진 원본 | **카드 생성 후 즉시 폐기** (기본) | Storage | 동의 시 30일 보관 |
| 닉네임/학교/학년 | **영구** | DB1 | 학생 요청 시 즉시 삭제 |
| Q1~Q10 응답 | **영구** | DB2 | 통계 활용은 별도 동의(`consent_research_use`) |
| 페르소나/카드 | **영구** | DB2 + Storage | 학생이 언제든 본인 페이지에서 조회 |
| 부스 방문/리워드 | **영구** | DB3 | 운영 통계 |
| 감사 로그 | **영구** | ops | 보안 목적 |
| 잡 데이터 | 90일 후 자동 정리 | ops | 운영용 단기 데이터 |

### 10.2 동의 항목

1. **[필수]** 카드 생성을 위한 닉네임·사진·응답 수집·처리
2. **[필수]** AI 분석 처리 (OpenAI/OpenRouter로 전송됨)
3. **[필수]** 결과 영구 보관 및 본인 조회 제공
4. **[선택]** 사진 원본 30일 보관 (미체크 시 카드 생성 직후 자동 삭제)
5. **[선택]** 익명화된 응답 데이터를 통계·연구 목적으로 활용

### 10.3 삭제 요청

- 카드 QR(또는 카드 공유 토큰)로 본인 페이지 진입 → "내 데이터 삭제 요청" 버튼 → `DELETE /api/students/me` (확인 1회)
- 처리: `pii.students.deleted_at` 설정 + 생성 이미지/사진 Storage에서 삭제 + 응답 데이터는 닉네임을 `student_{hash}`로 익명화 (통계는 살려두기 위함)

### 10.4 보안 기술 조치

- 모든 Storage 파일: **Signed URL**로만 접근 (직접 URL 불가)
- 운영자/관리자 토큰은 `pii` 스키마 직접 접근 불가
- 운영자 비밀번호: **bcrypt** 해시 + salt
- 감사 로그: 모든 운영자 액션과 관리자 데이터 export 기록
- HTTPS 강제, HSTS 헤더, CORS 화이트리스트(`frontend` 도메인만)

---

## 11. 에러 처리와 재시도

### 11.1 에러 분류

| 종류 | 예시 | 처리 |
|---|---|---|
| **사용자 입력 오류** | 잘못된 닉네임, 만료된 토큰 | 4xx 응답, 클라이언트가 표시 |
| **외부 시스템 일시 오류** | OpenRouter timeout, Storage 일시 장애 | 재시도 (지수 백오프), 잡 큐의 retry |
| **외부 시스템 영구 오류** | OpenRouter 429 rate limit 도달 | 잡 큐에서 더 긴 backoff, 사용자에게 "혼잡함" 안내 |
| **내부 버그** | 코드 예외, DB constraint 위반 | 500 응답 + 감사 로그 + 알림 |

### 11.2 재시도 정책

- **HTTP 동기 AI 호출**: 어댑터에서 최대 2회 재시도(0.5s, 2s 백오프). 실패 시 사용자에게 명확한 메시지.
- **잡 큐 AI 호출**: `retry_count` 최대 2회. 실패 후엔 학생에게 "다시 시도" UI 제공(같은 session_id로 재요청 가능).
- **이미지 생성**: 한 장만 실패해도 카드는 발급(나머지 한 장으로 fallback). 둘 다 실패 시 페르소나 기본 일러스트로 대체.

### 11.3 사용자 경험 측 대응

- `/generating` 화면: 진행 중 메시지 (5초마다 메시지 변경: "응답을 분석하고 있어요" → "어울리는 미래를 그리고 있어요" → "이미지를 만들고 있어요")
- 60초 이상 처리되면 "조금 더 걸리고 있어요" 표시
- 5분 이상이면 "혼잡합니다. 잠시 후 다시 시도해주세요" + 운영진 안내

---

## 12. 배포·환경 구성

### 12.1 환경

| 환경 | 용도 | 인프라 |
|---|---|---|
| **local** | 개발자 로컬 | docker-compose: Postgres + MinIO + app |
| **staging** | 사전 테스트, 부하 테스트 | Render Hobby + Supabase Free |
| **production** | 행사 당일 | Render Standard + Supabase Pro |

### 12.2 환경변수 (요약, `.env.example`에 전체)

```
# App
APP_ENV=production
APP_BASE_URL=https://api.ibe.example.com
FRONTEND_ORIGIN=https://ibe.example.com

# DB
SUPABASE_DB_URL=postgresql://...
SUPABASE_STORAGE_URL=...
SUPABASE_SERVICE_KEY=...

# Auth
JWT_SECRET=...
JWT_CARD_SHARE_SECRET=...   # 카드 영구 토큰은 별도 키
JWT_ISSUER=ibe

# AI
AI_PROVIDER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=...
AI_MODEL_ANALYZE=openai/gpt-5-mini
AI_MODEL_PERSONA=openai/gpt-5.2
AI_MODEL_PORTRAIT_IMAGE=openai/gpt-image-1.5
# ...

# Worker
CARD_WORKER_CONCURRENCY=10
IMAGE_CONCURRENCY=10
JOB_POLL_INTERVAL_SECONDS=1
JOB_MAX_RETRIES=2
```

### 12.3 배포 흐름

1. PR 머지 → GitHub Actions 빌드 → Docker 이미지 push → Render 자동 배포
2. 마이그레이션은 별도 step (`supabase db push`)
3. 배포 후 헬스체크 (`GET /healthz`)

### 12.4 행사 당일 운영

- 행사 1일 전: staging에서 100명 동시 카드 생성 부하 테스트
- 행사 1시간 전: production 인스턴스 크기 1단계 업
- 행사 중: 관리자 대시보드에서 `ops.jobs` 큐 길이 모니터링
- 행사 후: 인스턴스 다운그레이드, 사진 폐기 cron 실행

---

## 13. 관측성 (Observability)

- **로깅**: 구조화 JSON 로그. `request_id` 헤더 받아 모든 로그에 첨부.
- **AI 호출 로깅**: 모든 OpenRouter 호출의 모델·토큰 사용량·지연시간 기록 → 비용 추적.
- **메트릭(옵션)**: 응답 시간 분위수, 잡 처리량, AI 호출 실패율 → Better Stack / Logtail / Vercel Analytics.
- **알림**: 잡 실패율 5% 초과, AI 호출 지연 30초 초과, DB 연결 실패 시 슬랙 알림(옵션).

---

## 14. 미결정 사항 / 후속 논의

| # | 항목 | 결정 필요 시점 |
|---|---|---|
| O-1 | AI 모델 조합 최종 확정 (gpt-5-mini vs Claude vs Gemini 비교) | 프롬프트 실험 후 |
| O-2 | 이미지 모델: gpt-image-1.5 vs Stability vs Fal.ai | 비용·속도·품질 테스트 후 |
| O-3 | 적응형 질문(Q7~9) 저장 형식: 텍스트만 vs 구조화 | 광민이의 질문 설계 확정 후 |
| O-4 | 부스-페르소나 추천 매핑 알고리즘 (키워드 매칭 vs 임베딩) | 부스 목록 확정 후 |
| O-5 | 단기 공유 토큰 만료시간 (24h? 7일?) | UX 결정 |
| O-6 | 행사 당일 워커 프로세스 분리 임계점 | 부하 테스트 결과 후 |

---

## 15. 다음 단계 (이 문서 합의 후)

1. ADR 분리 (각 결정마다 1파일): `docs/decisions/0001-…` ~ `0007-…`
2. API 엔드포인트 명세(OpenAPI) 초안: `docs/api/openapi.yaml`
3. `backend` 레포 초기 스캐폴딩 (디렉토리 + `pyproject.toml` + `Dockerfile`)
4. Supabase 프로젝트 생성 + 첫 마이그레이션 작성 (스키마 4개 + 테이블)
5. 프롬프트 초안 작성 (광민이 / 현정이와 협업)
6. 부하 테스트 시나리오 정의

---

## 16. 변경 이력

| 날짜 | 작성 | 변경 |
|---|---|---|
| 2026-05-31 | 초안 | 백엔드 종합 설계 v1 |
