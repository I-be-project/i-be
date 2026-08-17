# 학생 온보딩~페르소나 선택 흐름 — 설계서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-06-24 |
| 상태 | Draft — 구현 전 합의 |
| 적용 대상 | `frontend` 레포 (+ 추후 `backend` 계약) |
| 관련 문서 | `docs/backend-design.md`, `회의정리_진로교육카드프로젝트.md`, `frontend/docs/plan.md` |

> 학생이 **회원가입 → 로그인 → 사진 입력 → 질문(6개) → 반응형 질문(3개) → 페르소나 선택**을 거쳐 카드를 발급받는 앞단 흐름을 정의한다. 이번 단계는 **프론트 흐름 + 이를 받치는 Mock API 레이어**까지이며, 실제 백엔드 연동은 추후다.

---

## 1. 범위

### 1.1 이번 spec에 포함

- 회원가입 + 개인정보 수집 동의 화면
- 로그인 + 완료자 진입 게이트("이미 했어요")
- 사진 입력(촬영 가이드 프레임 / 갤러리, 필수)
- 고정 질문 6개
- 반응형 질문 3개 (이번 단계는 **고정 시퀀스**)
- AI 후보 페르소나 중 1개 선택
- 완료 결과 카드 / 개인 페이지 진입
- 위 흐름을 받치는 **Mock API 레이어**(실제 백엔드 계약 흉내)

### 1.2 제외(이번 단계 아님, 메모만)

- 실제 AI 페르소나/이미지 생성 (백엔드 + OpenRouter)
- 질문 최종 문항 내용 — 진로상담/심리 전문가 자문 후 확정 (`회의정리 §5`)
- 리워드 / QR / 운영자 / 관리자 화면
- 만 14세 미만 법정대리인 동의 연동 — 학교 가정통신문 툴 별도 (`회의정리 §9`)
- 실제 백엔드 연동 (계약만 맞춰두고 추후 교체)

---

## 2. 결정 사항 요약

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 결과물 순서: **spec 확정 → 프론트 구현** | 일요일까지 앞단 기획 초안 필요 (`회의정리 §10`) |
| D-2 | 페르소나는 **AI가 후보 N개 제안 → 학생이 1개 선택** | 기존 설계(단일 자동 생성)에서 변경 |
| D-3 | 비밀번호는 **사용자가 직접 설정** | 생년월일 추측 가능성 회피 |
| D-4 | 중간 이탈 = **처음부터 다시**(부분 진행 미저장) | 단순성. 진행 상태 저장 안 함 |
| D-5 | 완료자 재접속 = **결과 카드로**, 재시도 불가 (1인 1카드) | "이미 했으면 했다고 뜨기" |
| D-6 | 사진 = **필수**, 촬영(가이드 프레임) + 갤러리 둘 다 허용 | 폰 사용 학생 대상, 카드 필수 재료 |
| D-7 | mock 단계 상태는 **Mock API 레이어**(서버 상태)로 | 계정 단위 "이미 했어요"가 진짜처럼 동작, 백엔드 교체 용이 |
| D-8 | 식별 키에 **학년 포함**: `(학교, 학년, 반, 번호)` | 학년 구분 필요 (`회의정리 §3`) |
| D-9 | 페르소나 후보 **기본 3개** | UX 적정선 |
| D-10 | 반응형 질문은 mock 단계에서 **고정 3문항 시퀀스** | AI 동적 생성은 백엔드 단계로 미룸 |

---

## 3. 화면 흐름 (라우팅)

```
/                     웰컴 / 랜딩
/signup               회원가입 + 개인정보 동의
/login                로그인
  └ 로그인 성공 후 진입 게이트 (GET /api/me/status):
       completed?  → /me        (이미 했어요 → 결과 카드)
       그 외       → /onboarding/photo  (항상 처음부터)
/onboarding/photo     사진 입력 (촬영 가이드 프레임 / 갤러리, 필수)
/questions            고정 질문 6개
/questions/adaptive   반응형 질문 3개 (Q7·Q8·Q9, 고정 시퀀스)
/persona/select       AI 후보 3개 중 1개 선택
/me                   완료 결과 카드 / 개인 페이지
```

### 3.1 기존 `/explore/*` 와의 관계

현재 프로토타입은 **입력 방식 4종(말·이미지·단어·게임) 선택** 기반의 `/explore/*` 흐름이다. 이번 새 흐름은 **선형**이며 실제 제품 방향이다.

- 새 흐름은 위의 새 라우트로 정리한다.
- 기존 `/explore/*`, `useSessionStore`, `lib/mock/questions.ts`는 **참고용으로 유지**하고, 재사용 가능한 부분(`PersonaResult` 타입, 애니메이션 패턴, shadcn 컴포넌트)은 가져다 쓴다.
- 입력 방식 선택 UX는 추후 "질문 6개"의 표현 방식 후보로 재검토할 수 있으나, 이번 범위에선 단일 선형 폼으로 둔다.

---

## 4. 진행 상태 머신

서버(이번 단계는 Mock API)가 **단일 소스**다. 학생별로 다음 상태만 가진다.

```
[ 계정 없음 ] ──register──> [ registered ] ──persona/select──> [ completed ]
                                  │                                  │
                          (중간 이탈 시 진행 미저장)          (1인 1카드, 재시도 불가)
                                  │                                  │
                          로그인 → 항상 /onboarding/photo    로그인 → 항상 /me (결과)
```

| 상태 | 의미 | 로그인 시 진입 |
|---|---|---|
| `registered` | 가입했으나 미완료(또는 중간 이탈) | `/onboarding/photo` (처음부터) |
| `completed` | 페르소나 선택까지 완료 | `/me` (결과 카드) |

**핵심 규칙**

1. **부분 진행은 저장하지 않는다.** 사진/질문 도중 이탈하면 다음 로그인 때 사진부터 다시 시작한다.
2. **완료자는 어느 경로로 들어와도 `/me`로 리다이렉트한다.** (게이트는 `/onboarding/*`, `/questions/*`, `/persona/*` 진입 시 `GET /api/me/status`로 검사)
3. mock 저장 대상은 `(계정, 완료여부, 선택한 카드)`뿐. 답변/사진은 완료 확정 시점에만 카드에 묶여 보존된다.

---

## 5. Mock API 레이어

Next.js route handler(`app/api/**/route.ts`)로 **실제 백엔드 계약을 흉내**낸다. 추후 진짜 백엔드로 base URL만 바꿔 교체 가능하게 설계한다.

| 메서드 · 경로 | 책임 | 응답 핵심 |
|---|---|---|
| `POST /api/auth/register` | 계정 생성. `(학교,학년,반,번호)` 중복 검사 + 동의 플래그 저장 | 세션 토큰(mock), `status` |
| `POST /api/auth/login` | 식별자+비번 검증 | 세션 토큰(mock), `status`(`registered`/`completed`) |
| `GET /api/me/status` | 진입 게이트용 현재 상태 + (완료 시)카드 요약 | `{ status, card? }` |
| `POST /api/onboarding/photo` | 사진 업로드(mock 저장) | `{ ok }` |
| `POST /api/session/answers` | 고정 질문 6개 답변 제출 | `{ ok }` |
| `POST /api/session/adaptive` | 반응형 질문 3개 답변 제출 | `{ ok }` |
| `POST /api/persona/candidates` | 답변 기반 후보 페르소나 3개 반환 (mock 규칙/랜덤) | `{ candidates: PersonaCandidate[] }` |
| `POST /api/persona/select` | 선택 확정 → `completed` 전이 + 카드 생성 | `{ card }` |

**저장소**: 서버 메모리 + JSON 파일(개발 중 새로고침에도 유지). 프로덕션 백엔드 계약(`docs/backend-design.md §8.2`)과 어긋나지 않게 엔드포인트 형태를 맞춘다.

**인증**: mock 세션 토큰을 발급해 `Authorization` 헤더로 전달(실제 JWT 흐름 흉내). 검증은 mock 수준.

---

## 6. 데이터 모델 (프론트/계약)

> 컬럼 타입·제약 등 세부는 구현 시 확정. 여기서는 책임과 형태까지만.

### 6.1 식별

- **식별 키**: `(학교, 학년, 반, 번호)` 유니크. 로그인 식별자로 사용.
- 동명이인/같은 번호 충돌 방지를 위해 위 4개 조합으로 1명을 특정한다.

### 6.2 엔티티

```ts
interface StudentAccount {
  id: string;
  school: string;
  grade: number;       // 학년 (1~3)
  classNo: number;     // 반
  number: number;      // 번호
  name: string;
  password: string;    // mock 단계는 평문 보관, 백엔드는 bcrypt
  consents: Consents;
  createdAt: string;
}

interface Consents {
  collectAndProcess: boolean; // [필수] 수집·처리
  aiProcessing: boolean;      // [필수] AI 분석(외부 전송)
  permanentStore: boolean;    // [필수] 결과 영구 보관
  keepPhoto30d?: boolean;     // [선택] 사진 30일 보관
  researchUse?: boolean;      // [선택] 익명화 응답 연구 활용
}

interface PersonaCandidate {  // 기존 PersonaResult 확장
  id: string;
  name: string;
  tagline: string;
  keywords: string[];
  fields: string[];
  imageUrl: string;           // mock placeholder
}

interface CompletionRecord {
  studentId: string;
  selectedPersonaId: string;
  cardId: string;
  completedAt: string;
}
```

---

## 7. 화면별 UX

### 7.1 회원가입 `/signup`
- 단계형 폼: 학교 → 학년/반/번호 → 이름 → 비밀번호(직접 설정, 확인 입력) → 동의
- 동의: 필수 3개(미체크 시 진행 불가) + 선택 2개. **면책 조항** 포함 (`회의정리 §9`)
- 제출 → `POST /api/auth/register`. 중복이면 로그인 유도.

### 7.2 로그인 `/login`
- 입력: 학교/학년/반/번호 + 비밀번호 (이름은 식별 보조)
- 성공 → `status` 분기: `completed`면 `/me`, 아니면 `/onboarding/photo`

### 7.3 사진 입력 `/onboarding/photo`
- 탭 2개: **촬영**(얼굴 가이드 프레임 오버레이) / **갤러리 선택**
- 미리보기 + 다시 찍기/다시 고르기
- 필수: 사진 없으면 "다음" 비활성
- 제출 → `POST /api/onboarding/photo`

### 7.4 고정 질문 6개 `/questions`
- 한 문항씩, 진행률 표시(1/6 …)
- 문항 내용은 **placeholder** (전문가 자문 후 확정). RIASEC 6속성 점수화 의도만 메모.
- 6개 완료 → `POST /api/session/answers` → 반응형으로

### 7.5 반응형 질문 3개 `/questions/adaptive`
- Q7·Q8·Q9. 이번 단계는 **고정 시퀀스**(AI 동적 생성 아님).
- 사이에 "분석 중" 연출 가능. 완료 → `POST /api/session/adaptive`

### 7.6 페르소나 선택 `/persona/select`
- `POST /api/persona/candidates`로 후보 **3개** 로드
- 카드 형태로 제시(그리드/스와이프), 1개 선택 → 확정 모달
- 확정 → `POST /api/persona/select` → `completed` 전이 + 카드 생성 → `/me`

### 7.7 완료 `/me`
- 선택한 페르소나 카드 + 개인 페이지 진입점
- 완료자 진입 게이트의 도착지

---

## 8. 에러 / 엣지 케이스

| 상황 | 처리 |
|---|---|
| 가입 시 이미 존재하는 학생 | "이미 가입됨" → 로그인 유도 |
| 로그인 비번 오류 | 인라인 에러 메시지 |
| 완료자가 `/onboarding`·`/questions`·`/persona` 직접 진입 | 게이트가 `/me`로 리다이렉트 |
| 사진 미입력 상태로 다음 시도 | "다음" 비활성 + 안내 |
| 질문/사진 도중 새로고침·뒤로가기·이탈 | 진행 사라짐. 다음 로그인 시 사진부터 다시 (안내 문구) |
| 필수 동의 미체크 | 가입 진행 불가 |

---

## 9. 테스트 관점

- **상태 머신 전이**: `registered`(미완료) → 로그인 시 사진부터 / `completed` → 로그인 시 `/me`
- **Mock API 계약**: 각 엔드포인트 요청/응답 형태, 중복 가입 거부, 완료 후 재선택 거부
- **폼 검증**: 식별 키 필수값, 비밀번호 확인 일치, 필수 동의 체크
- **게이트 가드**: 완료자가 중간 라우트 진입 시 리다이렉트

---

## 10. 미결정 / 후속

| # | 항목 | 결정 시점 |
|---|---|---|
| O-1 | 고정 질문 6개 + 반응형 3개의 **실제 문항** | 전문가 자문 후 (토요일 행사 / 7-3 최종) |
| O-2 | mock 후보 페르소나 생성 규칙(랜덤 vs 답변 기반 간이 매핑) | 구현 시 |
| O-3 | 사진 가이드 프레임 디자인/비율 | 와이어프레임 단계 |
| O-4 | `/me` 개인 페이지에 무엇을 보여줄지 | 별도 와이어프레임 (`회의정리 §10`) |
| O-5 | 백엔드 실연동 시 인증(JWT) 전환 지점 | 백엔드 준비 후 |

---

## 11. 변경 이력

| 날짜 | 작성 | 변경 |
|---|---|---|
| 2026-06-24 | 초안 | 학생 온보딩~페르소나 선택 흐름 설계 v1 |
