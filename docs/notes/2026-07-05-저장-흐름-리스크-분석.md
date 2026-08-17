# 저장 흐름 리스크 분석 — 로그인 → 설문 Q9 완료 저장

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-05 |
| 상태 | Draft — 코드 반증 검증 완료본 |
| 범위 | 로그인 ~ 설문(Q1~6, Q7~9) ~ 세션 완료 저장의 코드·인프라 리스크 |
| 대상 인프라 | Vercel(프론트) · Supabase Postgres 무료티어 · AWS Lightsail 2GB/2vCPU(백엔드) · S3 · OpenRouter |
| 검증 방식 | 6개 차원 병렬 발굴 → 각 발견을 실제 코드로 적대적 반증 검증(CONFIRMED 31 / PLAUSIBLE 10 / REFUTED 6) |
| 관련 문서 | `2026-06-27-system-architecture.md`, `2026-06-27-backend-deploy-lightsail-supabase.md`, `DEPLOYMENT.md` |

> 이 문서는 "학생이 로그인해서 설문 9번까지 마치고 저장하는" 경로에서 발생 가능한 데이터 유실·중복·가용성 리스크를 코드(file:line 근거)와 인프라(무료티어·단일 인스턴스 한도) 양쪽에서 정리한다. 각 항목은 실제 코드로 반증 검증을 거쳤으며, 검증에서 과장·오류로 판명된 부분은 "검증 교정"으로 명시한다.

---

## 0. 한 줄 결론

이 흐름의 위험은 **하나의 근본 패턴**에서 대부분 파생된다.

> **프론트가 저장 실패를 조용히 삼키고 그대로 진행**
> **+ 백엔드가 비원자적이고 락/유니크가 없음**
> **+ 무료티어·단일 인스턴스가 그 실패 트리거를 증폭**

데이터 손실 시나리오는 대부분 "저장이 그 순간 실패해야" 발현되는 **조건부**다. 하지만 트리거(모바일 순단, 학급 동시 제출로 인한 풀 경합, 토큰 만료, 무료티어 pause)가 이 인프라 조합에서 드물지 않고, **손실이 조용해서 학생·운영자 모두 인지하지 못한다**는 점이 핵심 위험이다.

### 두 가지 중요한 검증 교정

1. **카드 워커는 현재 스텁**(`card_worker.py`가 `NotImplementedError`/`return None`). "워커가 DB 풀을 고갈시킨다"류 시나리오는 *지금은 미실현*이다. 단, **7월 말 카드 배치 생성으로 실구현되면 D-1·D-3이 즉시 악화**된다.
2. **무료티어 500MB 용량 압박은 이 행사 규모에서 사실상 무시 가능**(세션당 수 KB × 수백~수천 명 = 수 MB). 실제 DB 문제는 용량이 아니라 **정합성·오표기**다.

---

## 1. 저장 흐름 지도 (코드 경로)

```
[로그인]  frontend/app/login → loginStudent (api.ts)
   │        └ setAuth(token,id) → Zustand + localStorage(persist)
   ▼
[Q1~6]   frontend/app/explore/questions/page.tsx
   │        handleNext(마지막) → computeScores → saveAnswer(stage="q1to6")
   │        └ POST /api/sessions/answers  ── 첫 저장: 백엔드가 in_progress 세션 생성 + session_id 반환
   │        ⚠ 실패해도 console.error 후 setRiasec + router.push("/explore/evening")  ← 핵심 결함
   ▼
[evening] frontend/app/explore/evening/page.tsx  (저장 없음, useBlockBack)
   ▼
[Q7~9]   frontend/app/explore/path/page.tsx
   │        submitQ7a/b/8 → persistAnswer(stage)  ── void saveAnswer(...).catch(console.error)  [fire-and-forget]
   │        submitQ9 → finalizeSurvey:
   │             await saveAnswer(stage="q9")           ← await, 실패 시 재시도 UI
   │             await completeSurvey(null, sessionId)  ← 세션 completed 승격
   │        └ POST /api/sessions/complete
   ▼
[done]   frontend/app/explore/pending-card/page.tsx  (surveyCompleted=true)

백엔드: routers/sessions.py → services/session_service.py → repositories/session_repo.py → adapters/db_pool.py(asyncpg, max=10)
인증:   deps.py current_student (JWT, TTL 6h) · config.py student_token_ttl_hours=6
```

핵심 사실:
- 백엔드는 **단일 uvicorn 프로세스**(`Dockerfile`에 `--workers` 없음) → API·카드 워커가 **같은 이벤트루프·같은 asyncpg 풀(max=10)** 공유.
- Supabase는 **직접연결 `:5432`**(트랜잭션 풀러 아님).
- `insert_answer`는 `on conflict (session_id, stage) do update` — 같은 stage 재전송 시 덮어씀(멱등).
- 완료 게이트: `get_latest_completed_for_student` 존재 + `retry_enabled=false`(기본값)면 409.

---

## 2. 심각도 요약표

| # | 카테고리 | 제목 | 심각도 | 핵심 파일 |
|---|---|---|---|---|
| A-1 | 코드/유실 | Q1~6 저장 실패 삼킴 → RIASEC·낮 답변 영구 미저장 | **HIGH** | questions/page.tsx:96-109 |
| A-2 | 코드/유실 | submit_answer 세션 생성+삽입 비원자 | **HIGH** | session_service.py:152-165 |
| A-3 | 코드/유실 | 중간 저장 fire-and-forget 무재시도·무알림 | **HIGH** | path/page.tsx:139-147 |
| A-4 | 코드/유실 | 세션 분할(클로저 캡처 sessionId + 무직렬화) | MEDIUM | path/page.tsx:140-146 |
| A-5 | 코드/막다른길 | 완료 멱등성 부재 → 완료한 학생 영구 스톨 | **HIGH** | path/page.tsx:233-247 |
| A-6 | 코드/중복 | 완료 게이트 비원자 check-then-act, 유니크 없음 | MEDIUM | session_service.py:183-210 |
| A-7 | 코드/정합성 | 관리자 vs 프로필 "완료" 정의 이원화 | MEDIUM | session_repo.py:228-233 |
| A-8 | 코드/기능 | retry 켜도 로컬 surveyCompleted가 재도전 차단 | MEDIUM | useSessionStore.ts:121-143 |
| A-9 | 코드/저수준 | tie-breaker 없는 최신 판정 · detached completed | LOW | session_repo.py:126-143 |
| B-1 | 인증 | JWT 6h 만료 → 저장 401 유실 + 완료 스톨 | **HIGH** | config.py:55, api.ts |
| B-2 | 네트워크 | fetch 타임아웃 없음 → 백엔드 hang 시 영구 pending | MEDIUM | api.ts:129-160 |
| B-3 | Vercel | NEXT_PUBLIC_API_URL 빌드타임 인라인 + localhost 폴백 | MEDIUM | api.ts:9-10 |
| C-1 | Supabase | 7일 미사용 pause + lifespan connect 실패 crash loop | **HIGH** | main.py:39-42 |
| C-2 | Supabase | IPv6-only 직결 + Docker bridge IPv4 → DB 연결 실패 | **HIGH** | .env.example, compose.prod.yml |
| C-3 | Supabase | 무료 백업/PITR 부재 → 사고 시 PII 복구 불가 | **HIGH** | (운영) |
| C-4 | Supabase | statement/command_timeout 미설정 | MEDIUM | db_pool.py:23-27 |
| C-5 | Supabase | '다시하기'=INSERT 누적(용량은 무시가능), 정리 잡 없음 | LOW | session_repo.py |
| D-1 | Lightsail | 단일 프로세스에 API+워커 동거 → 저장 API 굶김 | **HIGH** | Dockerfile:26, main.py:46 |
| D-2 | Lightsail | 재배포 무중단 아님 → recreate 갭 502 + in-flight 유실 | MEDIUM | DEPLOYMENT.md |
| D-3 | Lightsail | 공유 asyncpg 풀 max=10 + acquire 타임아웃 없음 | MEDIUM | db_pool.py:36-40 |
| D-4 | Lightsail | SPOF · 로그 로테이션 부재 · 디스크 누적 | LOW | compose.prod.yml |

---

## A. 코드 — 데이터 유실 / 막다른 길 (최우선)

### A-1. Q1~6 저장 실패가 삼켜진 채 전진 → RIASEC·낮 답변 영구 미저장 `[HIGH]`

- **근거**: `frontend/app/explore/questions/page.tsx:96-109`, `frontend/lib/explore/flow.ts:52-62`, `backend/app/services/session_service.py:152-154`
- **시나리오**: 마지막 문항에서 `saveAnswer(stage:"q1to6")`가 네트워크 순단·백엔드 지연으로 실패하면 `catch`가 `console.error`만 하고 **곧바로 `setRiasec()` + `router.push("/explore/evening")`** 로 진행한다. `sessionId`를 못 받아 `null`로 남고, `resumeScreen`은 pairCode/riasec가 채워졌으므로 `evening`을 반환 → **다시는 questions로 돌려보내지 않는다**. `q1to6` 전송 지점은 이 한 곳뿐이라(grep 확정) **재저장 경로가 코드에 없다**.
- **영향**: 이후 밤 진입 시 `submit_answer`가 새 세션을 만들고 그 세션엔 q7a~q9만 담긴다. **완료 세션에 낮 6문항 + RIASEC + pairCode가 통째로 빈다**(관리자·카드 파이프라인이 반쪽 세션을 봄). `ProgressBadge`가 q1to6를 "RIASEC" 단계로 표시하므로 진행도에도 구멍.
- **완화 요소(검증)**: `useSessionStore.ts:192-206` partialize가 answers/riasecScores/pairCode를 localStorage에 보존 → 같은 기기엔 데이터가 남고 설문 자체는 정상 완료. 하지만 **서버로 재동기화하는 수단이 없어** DB/관리자 관점에서는 유실. → 심각도 critical에서 **high**로 조정.
- **권고**:
  1. q1to6 저장을 **진행 차단 게이트**로 승격 — 성공(또는 명시적 재시도)까지 `setRiasec`/`router.push` 보류.
  2. 최소한 밤 진입 시 `sessionId`가 없으면 path에서 먼저 q1to6를 재전송해 세션을 확보한 뒤 q7a 저장.
  3. 실패를 사용자에게 노출.

### A-2. `submit_answer`의 세션 생성 + 답변 삽입이 비원자적 `[HIGH]`

- **근거**: `backend/app/services/session_service.py:152-165`, `backend/app/repositories/session_repo.py:92-96, 177-181`, `db_pool.py:42-46`
- **시나리오**: `session_id=None`인 첫 저장에서 `sessions.create()`와 `insert_answer()`가 **각각 별도 커넥션(`conn=None` 분기)으로, 트랜잭션 없이** 실행된다. 자매 메서드 `complete_survey`는 `db_pool.transaction()`으로 감싸는데 여기만 누락. 무료티어 직결(`:5432`, pgbouncer 아님)의 유휴 커넥션 리셋, 또는 클라이언트 타임아웃에 의한 요청 취소로 두 번째 호출이 실패/취소되면 **답변 0개짜리 고아 in_progress 세션**이 커밋되고 해당 stage 답변은 유실된다.
- **영향**: 고아 세션 누적 + 트리거된 stage 답변 유실. 프론트는 예외를 삼켜(A-1/A-3) 재시도 시 또 `session_id=null`로 새 세션을 만든다.
- **검증 교정**: 정상 경로에선 둘 다 성공하므로 손실 없음(부분 실패 창 한정). 고아 세션 자체는 저비용. **수정 난도 낮음** — `create`/`insert_answer`가 이미 `conn` 파라미터를 받으므로 `complete_survey`처럼 `transaction()`으로 감싸기만 하면 된다.
- **권고**: `submit_answer` 전체(create + insert)를 `db_pool.transaction()`의 단일 conn으로 원자화.

### A-3. 중간 저장(q7a~q8) fire-and-forget · 무재시도·무알림 `[HIGH]`

- **근거**: `frontend/app/explore/path/page.tsx:139-147`, `:137`(주석 "실패해도 설문은 막지 않는다")
- **시나리오**: `persistAnswer`는 `void saveAnswer(...).then(...).catch(console.error)`. 한 번 실패하면 **재시도도 알림도 없다**. 흐름 가드는 로컬 선택 상태(`q7aSelection` 등)만 보고 다음 단계를 허용하므로 **모든 저장이 실패해도 학생은 끝까지 진행**해 finalize에 도달한다. resume useEffect는 "다음 단계 재생성"만 할 뿐 이전 단계를 재저장하지 않는다.
- **영향**: transient 실패 시 **한 stage만 빠진 완료 세션**이 정상 완료로 표시된다. `generated.answers` stage별 조회(관리자 상세)에 구멍. q9만 유일하게 `pendingRetry` 재시도 UI로 보호됨.
- **검증 교정**: 전면 장애는 오히려 생성 화면에서 전진을 막으므로 이 결함을 안 만든다(한 stage POST만 실패 + 직후 generateStage POST는 성공해야 발현). 의도된 트레이드오프지만, **finalize 시점 대조 재전송이 없어 조용한 부분 손실**이 가능.
- **권고**: 중간 저장을 큐 + 지수 백오프 재시도로 승격. finalize 직전 로컬 스토어의 모든 stage 답변을 서버와 대조해 누락분 재전송(`on conflict` upsert라 idempotent).

### A-4. 세션 분할: 클로저 캡처 `sessionId` + 무직렬화 `[MEDIUM]`

- **근거**: `frontend/app/explore/path/page.tsx:140-146`, `backend/app/services/session_service.py:152-154`
- **시나리오**: `.then` 콜백이 `getState()` 재조회 없이 **호출 시점에 캡처한 `sessionId`(=null)** 로 `if(!sessionId) setSessionId(...)`를 실행(last-writer-wins). q7a 저장이 지연되는 동안 q7b가 또 `null`로 발사되면 백엔드가 세션 B를 새로 만들고, q7a는 세션 A에 고아로 남는다. 완료는 한 세션만 승격 → 나머지 답변 유실.
- **검증 교정**: 정상 경로는 단계마다 LLM 생성(수 초) + 사람 클릭이 끼어 경합 창이 좁다. **DB 풀 경합/모바일 stall로 q7a 저장이 수 초 지연**되거나(=`/api/generate`는 DB 무관해서 계속 진행됨), **q7a 저장이 아예 실패**하면 경합 없이도 같은 분할이 일어난다.
- **권고**: 첫 `saveAnswer`를 await하여 sessionId 확정 후 다음 저장 직렬화(single-flight Promise 공유). `.then`에서 캡처값 대신 `useSessionStore.getState().sessionId` 재확인.

### A-5. 완료 멱등성 부재 → 완료한 학생이 영구 "저장 실패" 화면에 갇힘 `[HIGH]`

- **근거**: `frontend/app/explore/path/page.tsx:233-247`, `:293-294`(resume 재실행), `session_service.py:161-162, 185`
- **시나리오**: `finalizeSurvey`가 서버에서는 성공(세션 completed 커밋)했는데 **응답만 유실**되면 `catch`가 상태코드 구분 없이 실패 처리 → `surveyCompleted=false`. 재시도/새로고침 시 resume이 다시 `finalizeSurvey`를 부르는데:
  - `saveAnswer(q9)`가 이미 completed된 세션에 → **409** ("이미 종료된 세션입니다")
  - 또는 `completeSurvey`가 최근 completed + retry off → **409** ("이미 설문을 완료했습니다")

  프론트는 409를 일반 실패로 처리 → **탈출 불가**. 관리자 화면엔 완료로 보이는데 학생은 영구 스톨(데이터 정합성 괴리).
- **검증 교정**: 설문 데이터 자체는 안전하게 커밋되어 유실 아님(순수 UX/인지 스톨). 트리거는 "커밋 후 응답만 유실"의 좁은 네트워크 레이스지만, 발생 시 **인앱 자가복구 경로 전무**(새로고침·retry 토글로도 안 풀림). 단일 오프라인 학교 행사에서 커밋 직후 프록시 타임아웃 확률은 무시 못 함.
- **권고**: `finalizeSurvey` catch에서 `ApiError.status===409`면 **성공으로 간주**(`setSurveyCompleted(true)` + pending-card 이동). 또는 재시도 전 `getMyProfile.has_completed` 확인. resume 분기도 프로필 확인 선행.

### A-6. 완료 게이트가 비원자적 check-then-act, 유니크 없음 → 중복 completed `[MEDIUM]`

- **근거**: `backend/app/services/session_service.py:183-210`, `session_repo.py`(sessions 테이블에 학생당 유니크 제약 없음)
- **시나리오**: 게이트 검사(`get_latest_completed_for_student` SELECT)와 승격(UPDATE/INSERT)이 **같은 트랜잭션·행락으로 묶여있지 않다**. `session_id=null`인 두 완료 요청이 거의 동시에 게이트를 통과하면 각자 새 completed 세션을 만들어 completed가 2개 생긴다. 같은 `session_id`로 동시 완료 시 persona 동봉이면 두 번째 personas INSERT가 UNIQUE 위반으로 500(현 학생 흐름은 persona=None이라 미해당).
- **검증 교정**: 스토어 `sessionId`가 이미 있으면 같은 세션 `update_status`(행락으로 직렬화)라 무해. 실제 트리거는 다중 탭/기기 이어하기 + sessionId 미확보의 좁은 경로.
- **권고**: 게이트 검사+승격을 한 트랜잭션에 넣고 `pg_advisory_xact_lock(hashtext(student_id))`로 직렬화. 또는 `where status='completed'` **부분 유니크 인덱스**로 DB 레벨 차단.

### A-7. 관리자 진행도 vs 학생 프로필의 "완료" 정의 이원화 `[MEDIUM]`

- **근거**: `session_repo.py:228-233`(관리자, `DISTINCT ON ... created_at desc`) vs `session_service.py:105`(프로필, `status='completed'` 필터), `update_status`(created_at 미변경)
- **시나리오**: 완료 승격은 `created_at`을 바꾸지 않으므로, 완료 세션보다 **나중에 생긴 고아 in_progress 세션**이 있으면 관리자 목록은 그 학생을 `in_progress`로 오표기하는데 프로필은 완료로 본다.
- **영향**: 완료율 집계·운영 판단 왜곡. `abandoned` 전이 경로가 코드에 아예 없어 고아 세션이 정리되지 않는 것이 근본 원인.
- **검증 교정**: '무료티어 용량 압박'·'카드 발급 누락'은 과장. 실제 영향은 대시보드 오표기.
- **권고**: 진행도 판정을 "완료 세션 존재(`exists status='completed'`) 우선"으로. 완료 승격 시 같은 학생의 잔여 in_progress를 같은 트랜잭션에서 `abandoned` 전이.

### A-8. retry 켜도 로컬 `surveyCompleted`가 재도전 차단 `[MEDIUM]`

- **근거**: `frontend/store/useSessionStore.ts:121-143`, `flow.ts:52-62, 76-81`
- **시나리오**: 운영자가 `retry_enabled`를 켜도, 같은 기기 재로그인은 `setAuth`의 sameStudent 분기로 `surveyCompleted=true`를 보존 → `resumeScreen`이 `done` 반환 → **재도전 흐름 진입 불가, pending-card로 튕김**. retry_enabled는 행사 전역 스위치라 켜지면 "같은 폰으로 완료 후 재도전" 경로 전체가 무력화됨.
- **권고**: 재도전 진입 시 서버 profile 응답의 `retry_enabled`/`has_completed`를 신뢰 소스로 삼아 로컬 `surveyCompleted`/`sessionId`/selections를 명시적으로 리셋(`reset()` 재사용) 후 `/explore`로.

### A-9. 저수준 정합성(LOW)

- **tie-breaker 없는 최신 판정** (`session_repo.py:126-143`): `get_latest_*`가 `order by created_at desc limit 1`만 사용, id 등 tie-breaker 없음. 동시 생성 세션 동률(마이크로초) 시 "최신"이 비결정적. → `order by created_at desc, id desc` 추가. (실발생 확률 낮음)
- **reuse=None detached completed** (`session_service.py:204-207`): retry_enabled=true 창에서 completed된 session_id로 /complete 재호출 시 답변 없는 새 completed 세션 생성 가능. → completed/타학생 session_id는 새 세션 생성 대신 멱등 반환/명시 에러.

---

## B. 인증 / 네트워크 / Vercel 경계

### B-1. JWT 6시간 TTL 만료 → 저장 401 유실 + 완료 스톨, 재로그인 유도 없음 `[HIGH]`

- **근거**: `backend/app/config.py:55`(`student_token_ttl_hours=6`), `auth_service.py:83`, `deps.py:128-135`, `frontend/lib/api.ts:129-160`(공통 401 처리 없음)
- **시나리오**: 종일 진행되는 "한마당" 특성상(오전 로그인 → 오후 완료, 탭 장시간 방치) 설문 도중 만료 가능. 만료 후 `persistAnswer`는 401을 삼켜 조용히 유실, `finalizeSurvey`는 401→에러 화면에 갇힌다. **api.ts에 공통 401 처리·재로그인 유도가 전혀 없다.**
- **검증에서 발견된 함정**: 백엔드 `/api/auth/refresh`(`auth.py`)는 `CurrentStudentDep`로 보호되어 **이미 만료된 토큰으로는 refresh도 401**. 따라서 "401 감지 후 refresh"는 만료 후엔 무용. **선제적(슬라이딩) 갱신** 또는 **401 시 강제 재로그인 유도**가 정답. (재로그인 시 sameStudent 진행 보존으로 이어하기 가능)
- **권고**: api.ts `request`에서 401 감지 시 재로그인 라우팅 공통 처리. 흐름 가드가 토큰 exp까지 검증. 만료가 잦으면 TTL 상향.

### B-2. 클라이언트 fetch 타임아웃 없음 → 백엔드 hang 시 완료가 영구 pending `[MEDIUM]`

- **근거**: `frontend/lib/api.ts:129-160`(AbortController/timeout 없이 `await fetch`)
- **시나리오**: 백엔드가 다운이 아니라 **응답만 늦어도**(풀 acquire 블로킹 등) `finalizeSurvey`의 await가 무한 대기 → `GeneratingScreen`에 갇히고 "다시 시도" 버튼조차 안 뜬다.
- **검증 교정**: 현재 워커 스텁이라 "카드 버스트 풀 고갈" 원동력은 미실현. `resume` useEffect가 새로고침 시 finalize 재실행으로 복구 가능(데이터 손실 아님). "무한 대기"도 브라우저 TCP 타임아웃(수 분) 상한 존재.
- **권고**: `request`에 AbortController 기반 타임아웃(15~20s) → 초과 시 `ApiError` 변환해 재시도 UI 노출.

### B-3. `NEXT_PUBLIC_API_URL` 빌드타임 인라인 + localhost 폴백 `[MEDIUM]`

- **근거**: `frontend/lib/api.ts:9-10`
- **시나리오**: Next.js는 `NEXT_PUBLIC_*`를 **빌드 시점에 번들에 인라인**한다. Vercel 환경변수 누락 시 `?? "http://localhost:8000"` 폴백이 프로덕션 번들에 박혀 **모든 학생이 자기 localhost로 저장 요청**. `http://<ip>:8000`을 넣으면 https Vercel 페이지에서 mixed-content 차단.
- **검증 교정**: 로그인도 같은 base URL로 깨지므로 배포 스모크(로그인 시도)에서 즉시 드러남 → 학생 무증상 도달 확률 낮음. 단 `DEPLOYMENT.md`에 **프론트 Vercel env 설정 절차가 전무**해 최초 배포자 누락 여지 실재.
- **권고**: 프로덕션 빌드에서 localhost 폴백 제거(미설정 시 빌드 실패). https 절대 URL 강제. Vercel 프리뷰/프로덕션 환경별 설정 문서화.

### B-4. 운영 CORS 단일 origin (LOW)

- **근거**: `backend/app/main.py:87-89`(`allow_origins=[frontend_origin]`)
- 저장 요청은 Authorization+JSON이라 preflight 유발. 실제 접속 origin이 `frontend_origin`과 다르면(apex/www, 커스텀 도메인, 프리뷰) 차단.
- **검증 교정**: 단일 origin은 표준 보안 설정. Vercel은 apex↔www를 canonical로 308 리다이렉트하므로 대개 일치. 전면 불일치는 completeSurvey 가시적 실패로 스모크에서 검출. → 실질 위험 낮음. 승인 origin 리스트/regex + 배포 시 일치 검증 정도의 하드닝.

---

## C. 인프라 — Supabase Postgres 무료티어

### C-1. 7일 미사용 자동 pause + lifespan connect 실패 시 crash loop `[HIGH · 조건부]`

- **근거**: `backend/app/main.py:39-42`(`await db_pool.connect()`가 startup에서 실행, 재시도 없음), 아키텍처 문서 §11
- **시나리오**: 카드 배치=7월 말, 행사=10월 → 그 사이 7일 이상 DB 활동이 없으면 무료 프로젝트가 자동 pause. 행사 당일 첫 요청이 paused DB로 가면 실패(`request`는 status 0 ApiError). 더 치명적으로 **그 시점 컨테이너 재시작 시 `connect()`가 실패 → startup 죽음 → `restart:unless-stopped`로 크래시 루프**. restore는 수동(보통 1~2분).
- **검증**: 무료 7일 pause는 문서화된 실동작(과장 아님). **어느 7일 창에라도 DB 활동이 있으면 pause 안 걸림.** 현재 **카드 워커가 스텁이라 DB keep-alive가 없어 pause 위험이 오히려 더 큼**. 장기 pause 시 프로젝트 삭제 위험(과거 ~90일선, 정책 변동 가능)은 참고치.
- **권고**: 행사 기간 keep-alive 크론(`SELECT 1`) 또는 활성기 Pro 승격. `main.py`는 connect 실패 시 앱을 죽이지 말고 lazy-connect + 백오프 재시도.

### C-2. IPv6-only 직접연결 + Docker bridge IPv4 → 컨테이너가 DB에 못 붙음 `[HIGH · 배포검증]`

- **근거**: `.env.example`/배포문서(`db.<ref>.supabase.co:5432`), `compose.prod.yml`
- **시나리오**: Supabase 직접연결은 **IPv6(AAAA) 전용**(2024년 이후 무료 직접 IPv4 폐기, 전용 IPv4는 유료 애드온). Lightsail 호스트를 dual-stack으로 잡아도 **Docker 기본 bridge는 IPv4 전용**이라 `enable_ipv6` 설정이 없으면 컨테이너 내부에서 IPv6 목적지로 라우팅 불가 → asyncpg가 `Network is unreachable`로 startup 실패(C-1과 동일 크래시 루프). 배포 문서가 직접연결을 기본으로 못박아 이 트랩을 놓치기 쉽다.
- **검증**: (1) 무료 직결 IPv6-only + 유료 IPv4 애드온 = 사실. IPv4 대안은 **Session-mode 풀러**(포트 5432, prepared statement 지원). Transaction 풀러 `:6543`만 asyncpg와 충돌(문서도 정확히 구분). (2) Docker 기본 bridge IPv6 아웃바운드 불가 = 정확. 배포/기동 시점에 시끄럽게 실패(런타임 조용한 유실 아님).
- **권고**: Docker 데몬/compose IPv6 활성화 **또는** Session 풀러를 DATABASE_URL로. **CD 헬스체크에 컨테이너 내부 DB 커넥션 스모크 테스트 포함**.

### C-3. 무료 자동 백업/PITR 부재 → 사고 시 학생 PII 복구 불가 `[HIGH · 운영]`

- **근거**: 아키텍처상 "진짜 데이터는 Supabase"(사진만 S3 영구). 무료티어는 자동 백업·PITR 없음(Pro부터 일일 백업, PITR은 유료 애드온). `student_repo.hard_delete`(언두 없는 하드 삭제) + admin bulk-delete 경로 존재.
- **시나리오**: 마이그레이션 사고(DROP/TRUNCATE), 관리자 대량 삭제, 장기 pause 후 삭제 시 **세션·답변·페르소나(미성년 PII)가 서버측 복구 수단 0(RPO=전체)**. DB 매핑이 날아가면 S3 사진만 고아로 남는다.
- **권고**: 배치 직후·행사 직전 `pg_dump` 스냅샷 오프사이트 보관. 데이터 보유 기간 Pro 승격. bulk-delete는 소프트 삭제 또는 사전 덤프 강제.

### C-4. `statement_timeout` / `command_timeout` 미설정 `[MEDIUM]`

- **근거**: `backend/app/adapters/db_pool.py:23-27`(create_pool에 command_timeout·server_settings 없음)
- `postgres` 롤 직접연결은 PostgREST API 롤의 기본 statement_timeout(~8s) 안전장치가 없고, asyncpg 측 상한(`command_timeout`)도 None(무제한). 무료 공유 CPU 스파이크 시 관리자 조인 쿼리 등이 스스로 취소 안 되고 커넥션·CPU 점유 → D-3 풀 고갈 가속.
- **권고**: `server_settings`로 `statement_timeout`·`idle_in_transaction_session_timeout` 명시 + `command_timeout` 설정.

### C-5. '다시하기'=INSERT 누적, 정리 잡 없음 `[LOW]`

- 무료 500MB·egress 5GB/월 수치는 정확하나 **이 규모에서 압박은 사실상 없음**(세션당 수 KB, 이미지는 S3 위임). 실제 관심사는 고아/중복 세션 누적에 따른 관리자 조회 정합성(A-7). 유령 세션 정리 잡·보존 정책은 장기 운영 위생 차원.

> **연결 상한 교정**: 무료 직결 동시 연결 상한은 대략 ~60(가장 작은 인스턴스). 앱 풀 `max=10`은 DB 상한 대비 여유가 크다. **실질 병목은 DB 상한이 아니라 앱 풀 10 자체**다.

---

## D. 인프라 — AWS Lightsail 2GB / 2vCPU 단일 인스턴스

### D-1. 단일 uvicorn 프로세스에 API + 카드/이미지 워커 동거 → 저장 API 굶김 `[HIGH · 워커 실구현 시 악화]`

- **근거**: `backend/Dockerfile:26`(`uvicorn ...` — `--workers` 없음 → 단일 프로세스/이벤트루프), `main.py:46-48`(워커 `asyncio.create_task`), `config.py:91,98`(image_concurrency=10, card_worker_concurrency=10)
- **시나리오**: API 핸들러와 카드/이미지 생성이 **같은 이벤트루프·같은 asyncpg 풀·같은 2vCPU**를 공유. 이미지 응답(2K, 수 MB base64 data URI)의 `response.json()` 파싱과 `base64` 인/디코드가 **스레드풀이 아니라 이벤트루프 스레드에서 동기 실행**되어, 다수 응답이 몰리면 단일 이벤트루프가 굶어 설문 저장 API가 지연된다. 저장 지연 → 프론트 fire-and-forget이 실패를 못 잡음 → 조용한 유실.
- **검증 교정**: 이미지당 b64decode 수~수십 ms + json.loads 수십 ms 수준 → 버스트 시 수백 ms~저초 루프 스톨. **현재 워커가 스텁이라 dev 라우터 수동 호출 한정**. 배치 생성 실구현 시(7월 말) **critical로 악화**.
- **권고**: 워커를 별도 컨테이너/프로세스로 분리. base64/json 파싱을 `run_in_threadpool`로 이관. 동시성을 2GB/2vCPU에 맞게 **2~3으로 하향**. (dev 라우터 운영 가드도 필요)

### D-2. 재배포가 무중단 아님 → recreate 갭 502 + in-flight 유실 `[MEDIUM]`

- **근거**: `DEPLOYMENT.md`(`docker compose up -d --build app`), `compose.prod.yml`(Caddy `depends_on`만, readiness/graceful drain 없음)
- **시나리오**: `production` push 시 서버에서 앱 컨테이너를 재빌드·재생성. 신 컨테이너가 listen하기 전까지 Caddy는 upstream 부재로 **502 반환**, 그 순간 저장/완료 요청이 실패하고 프론트가 삼켜 조용히 유실. 의존성(uv.lock) 변경 시 서버 빌드가 2vCPU 포화.
- **검증 교정**: 다운타임은 recreate 갭 수 초 규모(60초 아님). `backend/**` production push에만 트리거되고 concurrency로 큐잉됨. **수업 중 무심코 핫픽스 배포가 footgun**.
- **권고**: CI에서 이미지 빌드 → 레지스트리(GHCR) pull(서버 빌드 제거). `stop_grace_period` + uvicorn graceful drain. 행사 시간대 배포 금지 운영 규칙.

### D-3. 공유 asyncpg 풀 max=10 + acquire 타임아웃 없음 → 포화 시 무한 대기 `[MEDIUM]`

- **근거**: `backend/app/adapters/db_pool.py:20, 36-40`(max_size=10, acquire에 timeout 미전달)
- **시나리오**: 워커·chat 요청·프로필 조회·저장 API가 모두 같은 풀에서 커넥션을 뽑는다. 10개가 모두 사용 중이면 다음 저장 요청의 `pool.acquire()`가 **timeout=None 기본값으로 무한 대기**(fail-fast 없음). `submit_answer`는 `session_id=null`일 때 커넥션을 2회 잡아 압박 배가.
- **검증 교정**: 모든 쿼리가 `async with`로 커넥션을 즉시 반납하고 AI 호출 중엔 커넥션을 안 잡으므로 정상 부하에선 여유. 무한 대기는 동시 10건 초과 지속 포화 또는 커넥션 스톨에서만. **워커 실구현 후 악화**.
- **권고**: `acquire(timeout=...)`로 소진 시 503 fail-fast. `create_pool`에 `command_timeout`. `submit_answer` create+insert를 단일 트랜잭션으로 묶어 커넥션 사용 절반. 워커/요청 풀 분리.

### D-4. SPOF · 로그 로테이션 부재 · 디스크 누적 `[LOW]`

- app+워커+Caddy 동거 = 단일 장애점. 정상 부하에선 연산 위임 구조라 OOM 확률 낮음(무거운 건 OpenRouter/S3).
- json-file 로그 기본 무제한 + `docker image prune`이 빌드 캐시 미정리 → 장기 디스크(60GB) 누적. → `logging max-size:10m,max-file:3` + `docker builder prune` + 디스크 알람. (행사 생애주기 내 outage 확률은 낮음)

---

## E. 우선순위별 수정 로드맵

| 순위 | 항목 | 조치 | 관련 |
|---|---|---|---|
| **1** | 저장 실패 삼킴 | Q1~6 저장을 진행 차단 게이트로(성공/재시도 전 evening 금지). 중간 저장도 큐+지수 백오프 재시도 | A-1, A-3 |
| **2** | 완료 멱등성 | `completeSurvey`/`saveAnswer(q9)` **409는 "이미 완료=성공"으로** 처리. 또는 재시도 전 `getMyProfile.has_completed` 확인 | A-5, B-1 |
| **3** | 백엔드 원자화 | `submit_answer` create+insert를 `transaction()`으로. 완료 게이트를 advisory lock/부분 유니크로 직렬화 | A-2, A-6 |
| **4** | 401 처리 | api.ts 공통 401 → 재로그인 유도(진행상황 localStorage 보존). 선제 갱신 또는 TTL 상향 | B-1 |
| **5** | 인프라 하드닝 | fetch 타임아웃, `command_timeout`/`acquire timeout`, **CD에 IPv6/DB 커넥션 스모크 테스트** | B-2, C-2, C-4, D-3 |
| **6** | 행사 D-day 방어 | keep-alive 크론(pause 방지), 사전 `pg_dump`, 워커 concurrency 2~3, 수업시간 배포 금지 | C-1, C-3, D-1, D-2 |
| **7** | 정합성/위생 | 관리자 진행도 completed 우선 판정 + 고아 세션 abandoned 전이, tie-breaker, 재도전 로컬 리셋 | A-7, A-8, A-9 |

---

## F. 부록 — 검증에서 기각(REFUTED)되거나 과장 교정된 항목

반증 검증에서 **기각(6건)** 또는 심각도 하향된 주요 사례(잘못된 방향으로 대응하지 않도록 기록):

- **"카드 워커가 DB 풀을 고갈시킨다"** → 현재 워커 스텁이라 **미실현**. 배치 실구현 시 재평가.
- **"무료 500MB 용량이 곧 찬다"** → 이 규모에서 **수 MB 수준, 무시 가능**. 실제 문제는 정합성.
- **"무료 직결 연결 상한(~60)이 병목"** → 앱 풀 max=10이 먼저 병목. DB 상한은 여유.
- **"401 감지 후 refresh로 복구"** → refresh도 인증 필요라 **만료 후엔 무용**. 선제 갱신이 정답.
- **"apex/www CORS 유실"** → Vercel canonical 308 리다이렉트로 대개 일치, 비전형 설정 한정.
- **"더블탭으로 흔히 중복 완료"** → `setGenerating(true)`+조건부 렌더로 상당 부분 완화. 실 트리거는 다중 탭/새로고침 + sessionId 미확보.

> 검증 산출물(31 CONFIRMED + 10 PLAUSIBLE 전체의 시나리오·file:line·검증노트)은 워크플로 결과 파일에 보존됨.

---

## 변경 이력

| 날짜 | 작성 | 변경 |
|---|---|---|
| 2026-07-05 | 초안 | 저장 흐름 리스크 분석 v1 — 6차원 병렬 발굴 + 코드 반증 검증(CONFIRMED 31/PLAUSIBLE 10/REFUTED 6) |
