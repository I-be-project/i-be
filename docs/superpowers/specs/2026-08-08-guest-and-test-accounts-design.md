# 개인 참여자 + 관리자 발급 테스트 계정 설계

작성일: 2026-08-08

## 배경

개발·QA 중 학생 계정을 새로 만들어 테스트하는데, 그 계정이 실제 학생 데이터와 같은 테이블에
섞여 관리자 목록·좌석표·학교 필터를 오염시킨다. 로컬 개발도 운영 Supabase에 직접 붙으므로
(`DEVELOPMENT.md`) 테스트가 곧 운영 DB에 행을 남긴다.

근본 원인은 둘이다.

1. **테스트 계정을 구분할 방법이 없다.** `pii.students`에 실제 학생과 테스트 계정이
   구분 없이 들어간다. `list_students`·`list_schools`·`get_class_progress`가 전부
   이 테이블을 그대로 집계한다.
2. **계정을 재사용할 수 없다.** `app/services/session_service.py:230` — 완료한 학생은
   전역 `retry_enabled`가 꺼져 있으면 설문을 다시 할 수 없다. 그래서 테스트할 때마다
   새 계정을 만들 수밖에 없고, 그것이 쌓인다.

여기에 더해 학교에 소속되지 않은 개인·성인도 행사에 참여할 수 있게 하려 한다.
두 요구는 **같은 문제를 공유한다** — 학교 식별 키 `(학교, 학년, 반, 번호)`를 쓸 수 없는
계정을 어떻게 저장하고 로그인시킬 것인가. 그래서 한 설계로 함께 다룬다.

## 범위

- 학생 계정에 종류(`kind`) 구분을 도입한다.
- 학교 없는 계정(개인 참여자·테스트 계정)의 저장·로그인 경로를 만든다.
- 테스트 계정은 **관리자만 발급**한다. 학생 화면에는 트리거를 두지 않는다.
- 테스트 계정은 설문을 반복할 수 있게 해 계정이 쌓이지 않게 한다.
- 관리자 화면에서 테스트 계정을 격리한다.

## 1. 계정 종류 — `kind`

| `kind` | 대상 | 생성 경로 | 학교 |
|---|---|---|---|
| `student` | 학교 소속 학생 (기존 전원) | 중학교·고등학교 탭 가입 | 있음 |
| `guest` | 개인·성인 참여자 | 개인 탭 가입 | 없음 |
| `test` | 테스트 계정 | 관리자 발급 | 없음 |

```sql
alter table pii.students add column kind text not null default 'student'
  check (kind in ('student', 'guest', 'test'));
```

기본값이 `'student'`이므로 기존 행은 전부 학교 소속으로 백필되고 동작이 바뀌지 않는다.

### 왜 boolean이 아니라 구분값인가

처음에는 `is_test boolean` 하나를 검토했다. 개인 참여자가 들어오면서 구분 대상이 셋이 됐고,
셋은 각각 다르게 취급된다 — 좌석표는 `student`만, 관리자 목록은 `test`만 숨기고,
설문 반복은 `test`만 허용한다. boolean 두 개(`is_test`, `is_guest`)로 나누면 둘 다 참인
불가능한 상태가 표현 가능해진다. 상호 배타적인 셋이므로 하나의 구분값이 맞다.

## 2. 학교 없는 계정의 식별

`guest`·`test`는 학교가 없다. 컬럼은 `not null`이므로 값은 채우되 의미를 비운다.

| 필드 | 값 |
|---|---|
| `school` | `''` (빈 문자열) |
| `grade` · `class_no` · `student_no` | `0` |

이 값들로는 유니크가 성립하지 않으므로 인덱스를 교체한다.

```sql
drop index if exists pii.students_login_key;

create unique index students_login_key on pii.students
  (school, grade, class_no, student_no)
  where deleted_at is null and kind = 'student';

create unique index students_name_key on pii.students
  (name)
  where deleted_at is null and kind in ('guest', 'test');
```

- 기존 인덱스를 `kind = 'student'`로 좁힌다. 기존 행은 전부 `student`라 제약이 그대로다.
- 학교 없는 계정은 **이름으로** 유니크하다. 동명이인 가입은 409로 거부하고
  "이미 쓰고 있는 이름이야, 다르게 정해줘"로 안내한다.
- `guest`와 `test`가 **같은 이름 공간**을 쓴다. 로그인은 `guest`만 조회하므로(§3) 분리해도
  모호해지지 않지만, 관리자 목록에 같은 이름이 둘 보이는 혼동을 막기 위해 공통으로 둔다.

### 왜 순번 자동 배정이 아닌가

`student_no`에 자동 증가 순번을 넣어 기존 인덱스를 그대로 쓰는 방법도 있다. 그러면 순번 발급에
동시성 제어가 필요하고(경쟁 조건), 발급된 숫자를 사용자가 기억해야 로그인할 수 있다.
이름 유니크는 그 둘을 다 없앤다.

## 3. 가입 · 로그인

### 학교급 탭 3개

`IdentityFields`가 탭(`중학교` · `고등학교` · `개인`)을 소유한다. 현재 `SchoolSelect` 내부에
있는 학교급 state를 상위로 끌어올리고, `SchoolSelect`는 주어진 학교급의 학교 선택만 담당한다.

- **중학교 · 고등학교**: 학교 선택 + 학년 · 반 · 번호 (기존과 동일)
- **개인**: 학교·학년·반·번호 입력란이 사라진다. 남는 것은 이름 · 성별 · 비밀번호로,
  전부 이미 가입 폼에 있는 항목이다(`frontend/app/signup/page.tsx:31-33`).

### API 계약

`RegisterRequest`·`LoginRequest`의 학교 4개 필드를 optional로 바꾸고 validator로 조합을 강제한다.

| 종류 | 로그인 키 |
|---|---|
| `student` | `(school, grade, class_no, student_no)` + `password` — 기존 그대로 |
| `guest` | `name` + `password` |
| `test` | **로그인 화면으로 진입 불가** — 관리자 토큰 발급만 (§4) |

- 학교 4개 필드가 **전부 있으면** 학교 소속, **전부 없으면** 개인. 일부만 오면 422.
- 기존 프론트는 항상 학교 4개를 보내므로 하위 호환이 유지된다.
- 로그인 실패는 기존과 같이 존재 여부를 노출하지 않는 단일 401.

**이름 로그인 조회는 `kind = 'guest'`로 한정한다.** 비밀번호가 숫자 4자리로 강제되므로
(`frontend/app/signup/page.tsx:75`), 테스트 계정을 이 경로에 두면 이름만 알면 사실상
누구나 들어갈 수 있다. 테스트 계정은 학생 로그인 화면에서 도달할 수 없어야 한다.

### 학교 없는 계정의 화면 표시

`school=''`·`grade=0`을 그대로 렌더링하는 곳이 있어 함께 고친다.

- **학생 프로필** (`frontend/app/(tabs)/profile/[id]/page.tsx:281`) — 현재
  `{school} · {grade}학년 {classNo}반 {studentNo}번`을 무조건 출력한다.
  학교 없는 계정은 이 줄을 `개인 참여자`로 대체한다.
- **관리자 목록·상세** — 학교 칸이 빈 문자열로 보이므로 `kind` 배지(`개인`/`테스트`)로 대체한다.

카드 이미지는 학교·학년을 쓰지 않으므로(`card_renderer.py`) 영향이 없다.

## 4. 테스트 계정 발급 (관리자)

세 엔드포인트 모두 관리자 인증(`CurrentAdminDep`)을 요구한다.

```
POST   /api/admin/students/test              body: { name, gender }  → 발급된 계정
POST   /api/admin/students/test/{id}/token                           → { student_token }
DELETE /api/admin/students/test                                      → { deleted: N }
```

- 발급은 `kind='test'`로 계정을 만든다. 이름은 `students_name_key`가 유니크를 강제한다.
- **비밀번호는 받지 않는다.** 서버가 랜덤 문자열로 채운다. 로그인에 쓰이지 않으므로
  관리자도 알 필요가 없고, 알 수 없으면 어딘가에 적어두다 새는 경로도 생기지 않는다.
- 일괄 삭제는 기존 `AdminService.delete_students`를 재사용한다
  (DB cascade + S3 사진·카드 이미지 정리).
- **라우트 선언 순서 주의**: `DELETE /students/test`를 `DELETE /students/{student_id}`보다
  먼저 선언해야 한다. 그렇지 않으면 `test`가 UUID 경로 파라미터로 매칭되어 422가 난다
  (`app/routers/admin.py:62`의 `/students/schools`와 같은 함정).

### 관리자 화면에서 테스트 시작

`frontend/app/admin/page.tsx`에 발급 버튼과 계정별 **"이 계정으로 테스트 시작"** 버튼을 둔다.

1. 버튼이 `POST /api/admin/students/test/{id}/token`으로 학생 토큰을 받는다.
2. `useSessionStore.setAuth(token, id)`로 학생 세션을 심는다.
3. 학생 화면으로 이동한다.

관리자 화면과 학생 화면이 같은 Next 앱이라 Zustand store를 그대로 공유하므로 추가 배선이 없다.
모바일 실기기 테스트는 폰 브라우저에서 관리자 로그인 후 같은 버튼을 누르면 된다.

발급받은 이름·비밀번호를 받아적어 로그인 화면에서 다시 칠 필요가 없어지므로,
보안을 얻으면서 조작 단계도 줄어든다.

### 왜 학생 화면에 트리거를 두지 않는가

학교 목록의 히든 항목이나 이름 규칙(`"테스트"로 시작`) 같은 트리거도 검토했다.
관리자 발급은 **운영 노출이 0**이다. 학생이 우연히 마주칠 경로가 없고,
AI 이미지 생성 비용이 나가는 계정을 외부에서 만들 수 없다.

## 5. 테스트 계정의 설문 반복

`kind='test'`면 전역 `retry_enabled`와 무관하게 설문을 반복할 수 있다.

- `SessionService.complete_survey` — 완료 세션이 있어도 `test`면 409를 내지 않는다.
- `SessionService.get_profile_summary` — 응답의 `retry_enabled`를
  `retry_enabled or kind == 'test'`로 내려 프론트에 "다시 하기" 버튼이 뜨게 한다.

`get_profile_summary`는 현재 `_fetch_student_info`가 `StudentRecord`를 `StudentInfo`로
바꾸며 버린다. `kind`가 필요하므로 레코드를 먼저 조회해 두 용도로 나눠 쓰도록 고친다.

**이것이 계정이 쌓이지 않는 이유다.** 발급받은 테스트 계정 하나로 설문을 몇 번이든
다시 돌릴 수 있으므로, 테스트마다 새 계정을 만들 필요가 사라진다.

## 6. 관리자 격리

| 쿼리 | 조건 | 이유 |
|---|---|---|
| `list_students` | `kind <> 'test'` | `include_test=true`로만 노출. 응답에 `kind` 포함 |
| `list_schools` | `kind = 'student'` | 학교 필터 드롭다운에 빈 문자열이 뜨지 않게 |
| `get_class_progress` | `kind = 'student'` | 좌석표는 학교·학년·반 단위 — 개인 참여자는 대상이 아니다 |

`list_students`의 기본 동작이 바뀌지만, 현재 `test` 계정이 0개라 외부 계약
(`docs/2026-07-31-admin-api-usage.md`)에 실질적 영향이 없다. 응답에 `kind`가 추가되는 것은
필드 추가이므로 하위 호환이다.

개인 참여자(`guest`)는 관리자 목록에 **그대로 보인다**. 실제 참여자이므로 숨길 이유가 없다.
좌석표와 학교 필터에서만 빠진다.

## 7. 마이그레이션 · 배포 순서

`backend/**`가 `production`에 머지되면 자동 재배포된다(`.github/workflows/deploy-backend.yml`).
실제 학생 데이터가 이미 들어있으므로 순서를 지킨다.

1. 마이그레이션 `0009`를 Supabase에 **먼저** 적용한다. 기존 행은 `kind='student'` 기본값으로
   백필되어 동작이 바뀌지 않으므로, 구 버전 앱이 붙어 있어도 안전하다.
2. PR을 `production`에 머지 → 자동 재배포 → `https://api.cnu-likelion.kr/healthz` 확인.

### 인덱스 교체 중 중복 가입 방지

`students_login_key`를 drop 후 재생성하는 사이에 중복 가입이 끼어들 수 있으므로,
**DROP과 CREATE를 한 트랜잭션으로 묶는다.** 트랜잭션이 테이블 쓰기를 잠그므로 창 자체가 없다.
현재 학생 수가 수백 명 규모라 인덱스 생성은 즉시 끝나고 잠금도 밀리초 단위다.

## 8. 하지 않는 것

- **개발용 Supabase 프로젝트 분리.** 운영 데이터로 확인해야 할 것이 많고(카드 배치가 이미
  7월에 돌았다), 빈 DB는 그 용도를 채우지 못한다. 별도 논의로 남긴다.
- **기존 테스트 계정 자동 분류.** 지금까지 실제 학교 이름으로 만든 테스트 계정은
  이 설계로 구분되지 않는다. 관리자 화면에서 직접 찾아 삭제한다.
- **개인 참여자의 좌석표 표시.** 좌석표는 학교·학년·반 구조에 묶여 있다.
- **비밀번호 해싱.** 기존 평문 저장 정책을 유지한다(이 작업의 범위가 아니다).

## 9. 테스트

| 파일 | 확인할 것 |
|---|---|
| `test_auth_service.py` | 개인 가입·로그인, 이름 중복 409, 학교 소속 기존 동작 유지, **`test` 계정은 이름·비밀번호가 맞아도 401** |
| `test_auth_router.py` | 요청 스키마 validator — 학교 4개 전부/전무만 통과, 일부만 오면 422 |
| `test_session_service.py` | `test`는 완료 후에도 반복 가능, `student`는 기존대로 409 |
| `test_admin_service.py` | `include_test` 필터, `list_schools`·`class_progress` 제외 |
| `test_admin_router.py` | 테스트 계정 발급·일괄 삭제, 토큰 발급(관리자 인증 없으면 401, `test`가 아닌 계정이면 거부), `/students/test`와 `/{student_id}` 라우트 순서 |
| `frontend/lib/api.test.ts` | 개인 모드 로그인·가입 요청 바디에 학교 필드가 빠지는지 |

프론트는 `npm run lint` · `npm run build` · `npm run test`, 백엔드는
`uv run ruff check .` · `ruff format --check .` · `mypy app` · `pytest`를 통과시킨다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-08 | 설계 v1 |
