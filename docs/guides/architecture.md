# 시스템 아키텍처 개요 — 진로 내비게이터(나Be한마당)

| 항목 | 값 |
|---|---|
| 범위 | 전체 시스템 구조(프론트·백엔드·데이터·배포·보안) |
| 관련 문서 | [`backend-design.md`](backend-design.md)(상세 설계), [`deployment.md`](deployment.md)(배포), [`operations.md`](operations.md)(운영) |

> 학생이 질문에 답하면 AI가 **페르소나(직업) 카드**를 만들어주고, 개인 페이지에서
> 결과를 확인·보관하는 참여형 진로 경험 시스템. 본 문서는 **전체 구조와 컴포넌트
> 책임**을 코드 없이 정리한다. 세부 구현은 관련 문서를 참조.

> **⚠️ 미구현 표시** — 이 문서는 설계 의도와 현재 구현을 함께 담는다. 아직
> 코드에 없는 것은 **🔴 미구현**으로 표시한다. 표시가 없으면 동작하는 것이다.

---

## 1. 핵심 결정 요약 (이 구조의 전제)

| # | 결정 |
|---|---|
| A-1 | 백엔드 = **FastAPI**, **AWS Lightsail 인스턴스**(상시 컨테이너)에 배포 |
| A-2 | RDB = **Supabase Postgres** (직접 연결, Dual-stack IPv6) |
| A-3 | 이미지·사진 = **AWS S3** (Supabase Storage 대신), 서빙은 presigned URL |
| A-4 | **사진 영구 보관** (자동삭제 안 함) — 동의/고지 필수 |
| A-5 | AI = **OpenRouter** (chat + image, Gemini "Nano Banana" 계열) |
| A-6 | 페르소나 = **AI가 후보 3개 제안 → 학생이 1개 선택** |
| A-7 | 완료 시 **1인 1카드**. 단 `kind='test'` 계정은 설문을 반복할 수 있다 |
| A-8 | 프론트 = Next.js 16, **Vercel 배포**. 백엔드와 실연동 완료 |
| A-9 | 참여 유형 3종 — **중학교·고등학교 학생**, **개인(guest)**, **테스트(test)** |
| A-10 | 부스 참여 = **학생이 부스 QR을 스캔**해 방문 인증 (운영자 스캔 방식에서 변경) |

---

## 2. 전체 구성도

```
   ┌──────────────┐   HTTPS   ┌──────────────────────────────────────┐
   │ 학생·운영진   │ ────────▶ │  Vercel — Next.js 16 (App Router)     │
   │ 관리자 브라우저│           │  학생 4탭 · /operator · /admin         │
   └──────────────┘           └──────────────────┬───────────────────┘
                                                 │ fetch (CORS)
                                                 ▼
                              ┌──────────────────────────────────────┐
                              │  AWS Lightsail 인스턴스 (Ubuntu)      │
                              │  ┌────────────────────────────────┐  │
                              │  │ Caddy (리버스 프록시·자동 HTTPS)│  │
                              │  └───────────────┬────────────────┘  │
                              │  ┌───────────────▼────────────────┐  │
                              │  │ FastAPI 컨테이너 :8000          │  │
                              │  │  - 라우터 / 서비스 / 리포지토리 │  │
                              │  │  - 어댑터(AI·S3·DB·JWT)        │  │
                              │  │  - 카드 워커 🔴 미구현          │  │
                              │  └───────────────┬────────────────┘  │
                              └──────────────────┼───────────────────┘
              ┌──────────────────────────────────┼──────────────────────────┐
              ▼                                  ▼                          ▼
     ┌──────────────────┐            ┌──────────────────────┐    ┌──────────────────┐
     │ Supabase Postgres│            │   AWS S3 (단일 버킷)  │    │   OpenRouter     │
     │  (RDB, IPv6 직결)│            │  uploads/   원본 사진 │    │  chat + image    │
     │  schema 3개      │            │  ai-images/ AI 인물   │    │  (Gemini 등)     │
     │  pii·generated·ops│           │  cards/     최종 카드 │    └──────────────────┘
     └──────────────────┘            └──────────┬───────────┘
                                                │ presigned URL
                                                ▼
                                     [브라우저가 이미지 직접 조회 — 앱 미경유]
```

핵심 원칙: **무거운 일은 위임한다.** 연산(LLM·이미지)=OpenRouter, 데이터=Supabase, 파일=S3. Lightsail은 **오케스트레이션(I/O)** 만 담당 → 작은 인스턴스로 충분.

---

## 3. 기술 스택

| 영역 | 선택 | 역할 |
|---|---|---|
| 프론트 | Next.js 16 (App Router) + TS + Tailwind + shadcn/ui + Zustand | 학생/운영자/관리자 UI |
| 백엔드 | Python + FastAPI (uvicorn) | API + 인-프로세스 워커 |
| 호스팅 | AWS Lightsail 인스턴스 + Docker + Caddy | 상시 컨테이너, 자동 HTTPS |
| RDB | Supabase Postgres | 구조화 데이터, jsonb |
| 파일 | AWS S3 (+선택 CloudFront) | 사진·카드 이미지, presigned URL |
| AI | OpenRouter | chat(분석·페르소나·프롬프트) + image(카드) |
| 인증 | JWT (학생/운영진/관리자) | 무상태 토큰 |
| CI/CD | GitHub Actions → SSH 배포 | **`production`에 `backend/**` 푸시** 시 재배포 |

---

## 4. 컴포넌트 구조

### 4.1 백엔드 레이어드 아키텍처
```
Router      HTTP 진입점 · 입력검증 · 인증가드 · Service 호출
   │
Service     비즈니스 규칙 · 트랜잭션 · 여러 Repo 조합
   │
Repository  DB 쿼리 (Supabase Postgres)
   │
Adapter     외부 시스템 추상화 — AIClient(OpenRouter) · StorageClient(S3) · DBPool · Security(JWT)
   │
Worker      jobs 큐 폴링 → CardService 호출 (자체 로직 없음)  🔴 미구현
```
- 의존성 방향: `Router → Service → Repository → DB`, Service는 Adapter도 호출.
- **StorageClient = S3 구현** (설계가 어댑터로 추상화해둬서 Supabase Storage→S3 교체가 국소 변경).

**실제 라우터** (`backend/app/routers/`)

| 라우터 | 프리픽스 | 용도 |
|---|---|---|
| `auth` | `/api/auth` | 학생 가입·로그인·토큰 갱신 |
| `students` | `/api/students` | 사진 업로드, 프로필 조회·수정·삭제 |
| `sessions` | `/api/sessions` | 답변 저장, 설문 완료, 다음 질문 |
| `questions` | `/api/generate` | AI 질문·페르소나 생성 (학생 토큰 필요) |
| `student_booths` | `/api/booths` | 학생용 부스 조회·방문 인증(QR) |
| `booths` | `/api/admin/booths` | 부스 관리·통계 (관리자/운영진) |
| `operator` | `/api/operator` | 운영진 공유 비밀번호 로그인 |
| `admin` | `/api/admin` | 회원 조회·삭제, 테스트 계정 발급 |
| `cards` | `/api/cards` | 카드 생성 잡·조회·공유 **🔴 전부 미구현** |
| `dev` | `/api/dev` | 개발 전용. `APP_ENV=local`에서만 등록 |

### 4.2 프론트 (Vercel 배포, 실연동 완료)

| 경로 | 대상 |
|---|---|
| `/signup` · `/login` | 가입·로그인. 참여 유형 탭(중학교·고등학교·개인) |
| `/explore` | 설문 진행 (고정 질문 → 생성형 질문 → 페르소나 선택) |
| `/(tabs)` | 완료 후 4탭 — `home` · `booths` · `tendency` · `profile` |
| `/b/[code]` | 부스 QR 진입 → 방문 인증 |
| `/operator` | 운영진 콘솔 (좌석표·부스·방문) |
| `/admin` | 관리자 콘솔 (회원·좌석표·부스·테스트 계정) |

`/operator`와 `/admin`은 화면 컴포넌트를 `components/console/`에서 공유하고
권한만 다르게 준다.

---

## 5. 데이터 저장 전략

### 5.1 무엇을 어디에
| 데이터 | 위치 | 비고 |
|---|---|---|
| 구조화 데이터(계정·세션·답변·페르소나·카드·리워드) | Supabase Postgres | 관계·트랜잭션 |
| 가변 페이로드(답변·원본 AI 응답·메타) | Postgres `jsonb` | 별도 NoSQL 미사용 |
| 얼굴 사진 원본 | **S3 `uploads/`** (프라이빗, **영구**) | DB엔 키만 |
| AI 생성 인물 | **S3 `ai-images/`** (프라이빗, 영구) | presigned URL 서빙 |
| 카드 이미지 | **S3 `cards/`** (프라이빗, 영구) | presigned URL 서빙 |

단일 비공개 버킷에 프리픽스로 나눈다. 버킷은 "모든 퍼블릭 액세스 차단",
노출은 presigned URL로만 한다.

### 5.2 Postgres 스키마 분리 (권한 격리)
물리 DB 1개 · 논리 schema 3개:

| schema | 테이블 | 책임 |
|---|---|---|
| `pii` | `students` | 학생 원본(학교/학년/반/번호/이름/성별/사진키/`kind`) |
| `generated` | `sessions` `answers` `personas` `cards` | 설문·답변·페르소나·카드 |
| `ops` | `settings` `booths` `booth_visits` | 운영 설정·부스·방문 기록 |

> 운영진 토큰은 조회 범위가 제한된다. 운영진 상세 조회에서 **설문 답변 원문은
> 제외**된다(`22d49e3`).

마이그레이션은 `backend/supabase/migrations/*.sql`. **CI·CD가 자동 적용하지
않는다** — [`deployment.md`](deployment.md) "DB 마이그레이션" 참고.

### 5.3 식별 키와 계정 종류

`pii.students.kind`로 세 종류를 구분한다.

| `kind` | 식별 방식 | 비고 |
|---|---|---|
| `student` | **(학교, 학년, 반, 번호)** 유니크 | 기본값. 중학교·고등학교 |
| `guest` | **이름** 기준 | 학교 없는 개인 참여자. `school=''`, 나머지 `0` |
| `test` | **이름** 기준 | 관리자가 발급. 학생 로그인 화면으로 진입 불가 |

- `guest`는 이름이 중복되면 로그인이 아니라 **이름 변경으로 안내**한다(`08469e0`).
- `test`는 설문을 반복할 수 있다(`f196846`). 관리자 회원 수·좌석표에서 격리되고
  별도 탭으로 표시된다.

---

## 6. 학생 흐름과 상태 머신

### 6.1 화면 흐름
```
회원가입(+개인정보 동의) → 로그인 → 사진 입력(필수) →
고정 질문 6개 → 생성형 질문 3개 → 페르소나 후보 3개 중 1개 선택
        │
        ▼
완료 후 4탭 —  홈 · 부스 · 성향 · 프로필
                    │
                    └─ 부스 QR 스캔(/b/<code>) → 방문 인증 → 부스 탭에 기록
```

### 6.2 진행 상태 (서버가 단일 소스)

`generated.sessions.status` ∈ `in_progress` · `completed` · `abandoned`.
**"완료했는가" = 그 학생의 가장 최근 세션이 `completed`인가.**

```
[계정없음] ─가입→ [in_progress] ─페르소나 선택→ [completed]
                      │                              │
              답변은 서버에 저장됨            1인 1카드 (test 계정은 예외)
                      │                              │
             로그인 시 이어서 진행         로그인 시 결과 화면으로
```

- **답변은 저장된다.** 토큰이 만료돼도 진행 상황을 보존한 채 재로그인한다(`92ae9db`).
- **완료 여부는 서버가 판정한다.** 로그인·웰컴 진입 시 백엔드 프로필을 조회해
  로컬 상태를 동기화한다(`afd7ee2`). 로컬만 믿으면 다른 기기 로그인 시 완료한
  설문을 다시 시키고, 재도전 세션이 생겨 관리자 화면에 "미완료"로 잘못 뜬다.
  단방향(완료→완료)만 맞추고 조회 실패 시 로컬 기준으로 진행한다(fail-open).

---

## 7. AI 오케스트레이션 (개념)

```
[Q1~6 + 생성형 Q7~9 응답]
        │
        ▼
[응답 해석 (chat)] → [페르소나 후보 3개 생성 (chat)]      ← 구현됨 (/api/generate)
        │
        ▼  ◀── 학생이 1개 선택
━━━━━━━━━━━━ 여기서부터 🔴 미구현 ━━━━━━━━━━━━
        │  jobs(generate_card) INSERT → 프론트는 폴링
        ▼ (인-프로세스 워커)
[이미지 프롬프트 (chat)] → [카드 이미지 생성 (image, 얼굴 유지 image-to-image)]
        │
        ▼
[카드 저장(S3 + DB) + 영구 공유 토큰 발급] → 잡 done → 결과 화면
```

> **🔴 카드 파이프라인은 운영 코드에 존재하지 않는다.**
> `backend/app/routers/cards.py`의 4개 엔드포인트가 전부 `NotImplementedError`이고,
> `ops.jobs` 큐 테이블 마이그레이션도 없다. 위 그림의 잡 큐잉 아래 전체가 설계
> 의도이며 구현이 아니다.
> → 필요 작업량과 일정은 [`../notes/2026-08-08-행사-부하-용량-점검.md`](../notes/2026-08-08-행사-부하-용량-점검.md) §2·§7.2

이미지 프롬프트는 `backend/app/core/prompts/image_prompt.py`에 있고, 입력 사진과
동일 인물을 28세로 그리도록 지시한다. **사진 품질이 카드 품질을 좌우한다.**

### 7.1 동기 / 비동기 경계
| 작업 | 처리 | 이유 |
|---|---|---|
| 응답 해석·후보 생성 | HTTP 동기 | 짧음(수~십수 초), 학생 대기 |
| 카드 이미지 생성 | **잡 큐 + 폴링 워커** 🔴 미구현 | 길음(30~60초), timeout·새로고침 대비 |

### 7.2 어댑터 원칙
- 코드는 모델명을 직접 호출하지 않고 **목적(purpose)** 으로 호출 → 모델 매핑은 환경변수.
- 동시성은 세마포어로 제한. **진짜 상한은 OpenRouter rate limit.**

---

## 8. 인증 / 인가

| 토큰 | 용도 | 만료 | 설정 |
|---|---|---|---|
| 학생 세션 | 설문 진행·프로필·부스 방문 | **12h** | `student_token_ttl_hours` |
| 운영진 세션 | 좌석표·부스·방문 조회 | **12h** | `operator_token_ttl_hours` |
| 관리자 세션 | 회원 관리·테스트 계정 | **12h** | `admin_token_ttl_hours` |
| 카드 공유 링크 | QR/개인 페이지 진입 | **24h** | `share_link_ttl_hours` |

- 권한 가드는 FastAPI 의존성으로 주입(`current_student` / `operator` / `admin`).
- **staff 가드**: 조회 계열 엔드포인트는 운영진 토큰도 허용한다(`00d7971`).
  쓰기·삭제는 관리자만.
- 학생 토큰은 만료 전 자동 갱신되고, 만료 시 진행 상황을 보존한 채 재로그인한다.
- 로그인 비밀번호는 `secrets.compare_digest`로 비교하되 **bytes로 인코딩**해서
  넘긴다. str을 그대로 넘기면 한글 등 비-ASCII에서 `TypeError` → 500이 난다(`d443159`).
- **운영 시크릿 가드**: `APP_ENV=production`에서 `JWT_SECRET`·`JWT_CARD_SHARE_SECRET`·
  `ADMIN_PASSWORD`·`OPERATOR_PASSWORD`·`FRONTEND_ORIGIN`이 없거나 예시값이면 **기동을
  거부**한다. → [`deployment.md`](deployment.md) "운영 필수 변수"
- `/api/dev`는 `APP_ENV=local`에서만 등록된다.

> 감사로그(`ops.audit_logs`) 🔴 미구현.

---

## 9. 배포 토폴로지

```
GitHub  production 브랜치에 backend/** push
   │  Actions: test 잡(ruff·mypy·pytest) → 통과 시 deploy 잡(SSH)
   │           서버에서 git reset --hard origin/production → compose up --build
   ▼
Lightsail 인스턴스 (2GB/2vCPU, Dual-stack)
   ├─ Caddy: 80/443, 자동 HTTPS(Let's Encrypt), reverse_proxy → app:8000
   └─ FastAPI 컨테이너 (8000은 외부 비공개)
        ├─→ Supabase Postgres  (직접연결 :5432, IPv6)
        ├─→ AWS S3            (uploads/ ai-images/ cards/, presigned URL)
        └─→ OpenRouter        (chat + image)

프론트: Vercel (별도 배포, GitHub 연동)
```
- 방화벽: 22(내 IP만)·80·443만 공개, 8000 비공개.
- 시크릿: 인스턴스 `backend/.env`. Lightsail은 EC2 instance role이 없어
  **IAM 사용자 키** 사용(해당 버킷만 허용하는 최소권한).
- **롤백 단계가 없다.** 새 컨테이너가 뜨지 못하면 API 전체가 내려간다.
  → [`operations.md`](operations.md) "행사 중 배포 동결"
- 배포 후 `https://api.cnu-likelion.kr/healthz`로 헬스체크한다.

---

## 10. 개인정보 / 보안

- **사진 영구 보관**(A-4) — 회원가입 동의·면책에 *영구 보관 및 이용 목적* 명시, 만 14세 미만은 **법정대리인 동의**(가정통신문). 삭제 요청 절차는 유지.
- 파일 접근은 **presigned URL만**(프라이빗 버킷, 직접 URL 불가).
- schema 단위 권한 격리(§5.2). 운영진 상세 조회에서 설문 답변 원문 제외.
- 비밀번호 해시(bcrypt, `bcrypt<5` 고정), HTTPS 강제.
- **CORS는 기본 전체 개방(`*`)이다.** 외부 기관에 관리자 API를 전달하려고 연 것으로
  (`5d7d085`), `CORS_ALLOW_ORIGINS`를 비워두면 `["*"]`가 된다. 좁히려면 콤마로 나열한다.
  → [`../notes/2026-07-31-관리자-api-외부-개방.md`](../notes/2026-07-31-관리자-api-외부-개방.md)

---

## 11. 부하 / 확장 전략

| 상황 | 설계상 동작 |
|---|---|
| 가벼운 요청 폭주 | 단일 인스턴스 asyncio가 동시 수백 처리. 병목은 Supabase 컴퓨트 |
| 카드 생성 폭주 | jobs 큐로 줄 세워 처리. 큐 임계 초과 시 429 백프레셔 **🔴 미구현** |
| 이미지 조회 폭주 | S3가 presigned URL로 직접 서빙 → 앱·Lightsail 전송 미소비 |
| 진짜 천장 | OpenRouter 이미지 rate limit |

> **⚠️ 현재 구성으로는 목표 규모를 감당하지 못한다는 것이 2026-08-08 점검 결론이다.**
> 행사 전 필수 작업 9건(Supabase Pro 전환, 인스턴스 확장, 워커 분리, 카드
> 파이프라인 구현, 부하 테스트, OpenRouter 크레딧 선충전 등)이 남아 있다.
> → [`../notes/2026-08-08-행사-부하-용량-점검.md`](../notes/2026-08-08-행사-부하-용량-점검.md)

부하 대응의 핵심 전략은 **사전 회원가입·설문**으로 현장 동시 접속 자체를 줄이는
것이다. 학교에 공문을 보내 미리 데이터를 모으고, 현장에서는 주로 조회만 한다.

---

## 12. 현재 구현 상태

| 영역 | 상태 |
|---|---|
| 학생 흐름 | 가입·로그인·사진 업로드·설문·페르소나 선택·4탭 **동작** |
| 참여 유형 | 중학교·고등학교·개인(guest)·테스트(test) **동작** |
| 부스 | 학생 QR 방문 인증, 부스 관리·통계 **동작** |
| 운영진 콘솔 | 좌석표·부스·방문 조회 **동작** |
| 관리자 콘솔 | 회원 조회·삭제, 테스트 계정 발급, 좌석표 **동작** |
| **카드 발급** | **🔴 미구현** — `cards.py` 전부 `NotImplementedError`, `ops.jobs` 없음 |
| 감사로그 | 🔴 미구현 |
| 모니터링·알림 | 🔴 없음 — 장애를 육안으로 확인해야 한다 |

---

## 13. 관련 문서
- 상세 백엔드 설계: [`backend-design.md`](backend-design.md)
- 배포: [`deployment.md`](deployment.md) · 운영: [`operations.md`](operations.md)
- 용량 점검: [`../notes/2026-08-08-행사-부하-용량-점검.md`](../notes/2026-08-08-행사-부하-용량-점검.md)
- 학생 온보딩 흐름 spec: [`../notes/2026-06-24-학생-온보딩-플로우-설계.md`](../notes/2026-06-24-학생-온보딩-플로우-설계.md)
- 기획/비전: [`../notes/2026-03-19-프로젝트-비전.md`](../notes/2026-03-19-프로젝트-비전.md)

---

## 14. 변경 이력
| 날짜 | 변경 |
|---|---|
| 2026-06-27 | 전체 아키텍처 개요 v1 (Lightsail·Supabase·S3·사진영구·페르소나선택 반영) |
| 2026-08-15 | 현행화 — 프론트 실연동·Vercel 배포, 스키마 3개(`rewards` 없음), 계정 종류(`kind`) 3종, 부스 QR 방문, 운영진 콘솔, 4탭 구조, 토큰 만료 12h, 배포 브랜치 `production`, S3 프리픽스 3종 반영. 카드 파이프라인·감사로그를 🔴 미구현으로 명시 |
