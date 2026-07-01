# 페르소나 생성 결과의 완료 저장 — 설계서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-01 |
| 상태 | Draft — 구현 전 합의 |
| 적용 대상 | `backend`, `frontend` |
| 관련 문서 | `docs/2026-06-24-student-onboarding-flow-design.md`, `docs/backend-design.md` |

> 학생이 **Q1~6(고정) → Q7~9(생성형) → Q10(페르소나 후보 생성) → 후보 1개 선택**까지 마쳤을 때,
> 그 결과를 백엔드에 **영구 저장**하고 "개인별 설문 완료" 상태로 전이시키는 흐름을 정의한다.
> 이번 범위는 **완료 저장(A+B)**까지이며, **카드 이미지 생성(C)은 제외**한다.

---

## 1. 배경 / 문제

검증 결과 현재 상태는 다음과 같다.

- **생성형 파트(Q7-B/Q8/Q9/Q10)는 진짜 구현됨** — 프론트 `explore/path`가 `POST /api/generate/{stage}`를 호출하고, 백엔드 `question_service`가 실제 OpenRouter LLM을 부른다. mock 폴백 없음.
- **그러나 두 가지 문제로 "완성"이 아니다:**
  1. **결과 화면에 mock이 뜬다.** `explore/interpreting/page.tsx`가 마운트 시 `mockPersonas` 중 하나를 랜덤 선택해 `setPersona()`로 **실제 AI 페르소나를 덮어쓴다.** 그래서 `result`·`card`에는 AI 결과가 아니라 랜덤 mock이 표시된다.
  2. **완료 상태가 저장되지 않는다.** `routers/sessions.py`·`routers/cards.py`가 전부 `NotImplementedError`. Q1~10 결과는 Zustand(메모리)에만 있어 새로고침 시 사라지고, 실제 학생이 `completed` 상태가 되지 않는다. `get_profile_summary`(읽기)는 이미 구현돼 있으나 그 상태를 쓰는 코드가 없다.

## 2. 목표 / 비목표

**목표**
- `interpreting`의 mock 덮어쓰기 제거 → 실제 AI 페르소나가 결과/카드에 표시.
- Q10 확정 시 `sessions`(status=completed) + `personas`를 백엔드에 원자적으로 저장.
- 저장 후 `get_profile_summary`(GET `/api/students/me`)가 `has_completed=true` + 선택 페르소나를 반환.

**비목표(이번 범위 아님)**
- 카드 이미지 생성/저장(C) — `cards` 테이블·`card_image_key`는 그대로 두고 나중에.
- 중간 답변(Q1~9) 개별 저장 — **최종 결과만 저장**하기로 결정(§3). `answers` 테이블 추가 없음.
- 이미지·리워드·QR·운영자 화면.

## 3. 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D-1 | **최종 결과만 저장** (중간 답변 미저장) | 기존 스키마·설계서 §4-3 유지. answers 테이블 불필요 |
| D-2 | **단일 원자적 완료 호출** (접근법 A) | 설계서 D-4 "부분 진행 미저장"과 일치. dangling in_progress 세션 없음 |
| D-3 | 완료 저장은 **인증 필요**, `/explore` 흐름에 **로그인 게이트 추가** | 완료 저장이 student_id를 요구. 기존 `signup/photo`·`profile` 패턴과 통일 |
| D-4 | 재완료는 **`retry_enabled` 스위치가 켜진 경우에만** 새 세션 생성, 아니면 409 | 설계서 D-5 "1인 1카드" |
| D-5 | 프론트가 조립한 선택 페르소나를 그대로 저장(서버 재생성 안 함) | stateless generate 구조 유지. LLM 재호출 비용·불일치 회피 |

## 4. 아키텍처 / 데이터 흐름

```
[explore] 진입
   └─ (신규) studentToken 없으면 /login 으로 리다이렉트   ← 로그인 게이트

[explore/path] Q10 확정 (submitQ10)
   ├─ setPersona(선택 페르소나)                         (기존 유지)
   └─ completeSurvey(token, persona)  ──▶ POST /api/sessions/complete   (신규, 인증)
                                            └─ SessionService.complete_survey(student_id, persona)
                                                 1) 최근 세션 검사
                                                      - 완료 + retry off → 409 (이미 완료)
                                                 2) DBPool.transaction() 안에서:
                                                      sessions INSERT (status='completed', completed_at=now())
                                                      personas INSERT (session_id FK, name/tagline/keywords/fields)
                                                 3) get_profile_summary(student_id) 조립해 ProfileSummary 반환
   ▼ (성공)
[explore/interpreting]  "분석 중" 애니메이션만 (mock 덮어쓰기 제거) ──▶ [explore/result] ──▶ [explore/card]
```

세션 모델은 기존 그대로: 학생 1:N 세션, 완료 판단 = 최근 세션 `status='completed'`, 재시도 = 새 세션 INSERT.
`session : persona = 1:1`, `persona : card = 1:1`.

## 5. 백엔드 변경

### 5.1 라우터 — `app/routers/sessions.py`
- 신규 `POST /api/sessions/complete` (인증 `CurrentStudentDep`).
  - Request body: `app/schemas/persona.py`의 기존 `Persona`(name/tagline/keywords/fields) 재사용.
  - 응답: 기존 `ProfileSummary`(`schemas/students.py`).
  - 위임: `SessionServiceDep.complete_survey(student_id, persona)`.
- 기존 stub(`POST /api/sessions`, `next-question`, `answers`)은 이번 범위 밖 — 그대로 둔다.

### 5.2 서비스 — `app/services/session_service.py`
- `complete_survey(student_id, persona) -> ProfileSummary` 구현:
  1. `sessions.get_latest_for_student(student_id)` 조회.
     - 최근 세션이 `completed`이고 `retry_enabled`가 false면 `ConflictError`(409) — "이미 완료했습니다".
  2. `DBPool.transaction()` 안에서 세션(completed) + 페르소나를 함께 생성(둘 다 성공 or 둘 다 롤백).
  3. `get_profile_summary(student_id)`를 재사용해 응답 조립.
- **트랜잭션 소유는 서비스**: `SessionService`에 `DBPool`을 주입(`deps.py`의 `get_session_service`에 `DBPoolDep` 추가). 서비스가 `async with db_pool.transaction() as conn:`로 트랜잭션을 열고, 그 `conn`을 두 repo의 `create(..., conn=conn)`에 넘겨 하나의 트랜잭션으로 묶는다.

### 5.3 저장소
- `app/repositories/session_repo.py` `create()`:
  - 인자 추가 — `status: str = 'in_progress'`, optional `conn`(트랜잭션 공유), `status='completed'`일 때 `completed_at=now()` 설정.
  - `conn`이 주어지면 그 커넥션으로 실행, 아니면 기존처럼 자체 `acquire`.
- `app/repositories/persona_repo.py` `create()` 구현(현재 stub):
  - `create(session_id, persona, conn=None) -> PersonaRecord`. keywords/fields는 jsonb로 직렬화(`json.dumps`)해 INSERT, RETURNING으로 레코드 반환.
- `card` 관련은 변경 없음(C 범위).

### 5.4 에러
- `app/core/errors`에 409용 에러가 있으면 재사용, 없으면 `ConflictError` 추가(도메인 에러 포맷 `{error:{code,message}}` 유지).

## 6. 프론트 변경

### 6.1 mock 덮어쓰기 제거 — `app/explore/interpreting/page.tsx`
- `import { mockPersonas }`와 `const randomPersona = ...; setPersona(randomPersona);` 제거.
- "분석 중" 키워드 애니메이션 + 3.5초 후 `/explore/result` 이동만 유지.
- persona가 없으면(직접 진입/새로고침) `/explore`로 리다이렉트(기존 result/card 패턴과 동일).

### 6.2 API 클라이언트 — `lib/api.ts`
- `completeSurvey(token: string, persona: {name,tagline,keywords,fields}): Promise<ProfileSummary>` 추가.
  - `POST /api/sessions/complete`, `Authorization: Bearer <token>`, body는 persona.

### 6.3 완료 호출 연동 — `app/explore/path/page.tsx`
- `submitQ10`에서 `setPersona(...)` 후 `completeSurvey(studentToken, persona)` 호출.
  - 성공 → `router.push("/explore/interpreting")`.
  - 실패 → 에러 UI + 재시도(persona는 스토어에 있으므로 재호출 가능).
- persona 매핑 시 저장 대상은 name/tagline/keywords/fields만(booths/recommended는 저장 안 함 — DB 스키마에 없음, 결과 화면 표시는 스토어 값 사용).

### 6.4 로그인 게이트 — `app/explore/page.tsx`
- `studentToken` 없으면 `/login`으로 리다이렉트(기존 `signup/photo/page.tsx` 패턴 재사용).

## 7. 에러 / 엣지 케이스

| 상황 | 처리 |
|---|---|
| 이미 완료 + retry off | 백엔드 409 → 프론트: "이미 완료했어요" 안내 후 프로필로 이동 |
| retry on + 재완료 | 새 세션 INSERT (D-4) |
| 토큰 없음/만료 | 백엔드 401 / 프론트 게이트 → 로그인 유도 |
| 저장 실패(5xx·네트워크) | 에러 UI + 재시도 버튼 |
| 원자성 | `DBPool.transaction()`으로 session+persona 함께 커밋(부분 저장 없음) |
| 완료됐는데 persona 없음(이론상) | `get_profile_summary`가 이미 `has_completed=true, persona=null` 처리 |

## 8. 테스트 관점

**백엔드**
- `complete_survey` → session(completed) + persona 생성. 이후 `get_profile_summary`가 `has_completed=true` + persona 반환.
- 완료 + retry off → 409. retry on → 새 세션 생성.
- 인증 없음 → 401.
- 트랜잭션: persona INSERT 실패 시 session도 롤백(부분 저장 없음).

**프론트**
- `interpreting`이 persona를 덮어쓰지 않음(Q10 결과 유지).
- `submitQ10`이 `completeSurvey` 호출, 성공 시 result까지 진행.
- 저장 실패 시 재시도 노출.
- `/explore` 진입 시 토큰 없으면 `/login` 리다이렉트.

## 9. 후속(이번 범위 밖)
- 카드 이미지 생성/저장(C): `dev/persona-card` 파이프라인을 정식 `/api/cards/*`로 승격, `card_image_key` 채우기.
- 세션 시작/중간 진행 추적(퍼널 분석)이 필요해지면 in_progress 세션 도입 재검토.
