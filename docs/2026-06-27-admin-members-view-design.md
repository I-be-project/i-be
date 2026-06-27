# 관리자 회원 조회 화면 — 설계 문서

작성일: 2026-06-27

## 목적

회원가입한 **모든 학생의 정보(이름·학교·학년/반/번호·가입일·비밀번호·사진)** 를
관리자가 한 화면에서 조회·검색할 수 있는 관리자 전용 화면을 만든다. 사진 노출이 핵심 요구.

## 결정 요약

| 항목 | 결정 |
| --- | --- |
| 관리자 인증 | 별도 관리자 로그인. `.env` 단일 계정, admin JWT(`kind=admin`) |
| 기능 범위 | 조회 + 검색/필터 (수정·삭제 등 관리 동작은 범위 밖) |
| 비밀번호 표시 | 기본 가림(`••••••`), 클릭 시 해당 행만 평문 표시 |
| 레이아웃 | 테이블 + 썸네일, 행 클릭 시 상세 모달 |
| 관리자 계정 저장 | 환경변수(`ADMIN_USERNAME`/`ADMIN_PASSWORD`) |

## 현재 코드 컨텍스트 (기반)

- `pii.students` 테이블: `id, school, grade, class_no, student_no, name, password(평문),
  photo_key, consent_privacy, created_at, deleted_at`. soft-delete(`deleted_at`).
- 사진: S3 비공개 버킷에 저장, `photo_key`만 DB 보관. 노출은 presigned GET URL.
  `StorageClient.create_signed_url(key, ttl_seconds=...)`.
- JWT 인프라: `core/security.py`에 `TokenKind.ADMIN` 이미 정의. `create_token`/`decode_token` 존재.
- `routers/admin.py`: stub 상태(`/dashboard`, `/stats/keywords`, `/operators` — NotImplementedError).
- `deps.py`: `current_student` 패턴 존재 — admin 의존성도 동일 패턴으로 추가.
- 프론트 `app/admin/`: 빈 스캐폴드(`content/`, `stats/`). 이번 범위 밖.
- 프론트 `lib/api.ts`: `ApiError`, `parseErrorMessage` — 도메인/검증 에러 통일.

## 1. 백엔드 (FastAPI)

### 1.1 설정 (`config.py`)
- 추가: `admin_username: str`, `admin_password: str`, `admin_token_ttl_hours: int`(기본 12).
- `admin_password`는 평문 비교(단일 운영 계정). 운영 배포 시 `.env`로 주입, 기본값은 비워두거나 `change-me`.

### 1.2 관리자 로그인
- `POST /api/admin/login`
  - 요청: `AdminLoginRequest { username, password }`
  - 검증: `config.admin_username`/`admin_password`와 일치 확인. 불일치 시 `UnauthorizedError`(401).
  - 성공: `create_token(kind=ADMIN, subject=username, ttl=admin_token_ttl_hours)` → `AdminLoginResponse { admin_token }`.

### 1.3 인증 의존성 (`deps.py`)
- `current_admin(credentials, settings) -> str`(username): `decode_token(expected_kind=ADMIN)`.
  토큰 없음·잘못된 kind·만료·서명 오류 → `UnauthorizedError`.
- `CurrentAdminDep = Annotated[str, Depends(current_admin)]`.

### 1.4 회원 목록 API
- `GET /api/admin/students` (admin 토큰 필수)
  - 쿼리: `q`(이름 부분검색, optional), `school`(optional), `grade`(optional), `class_no`(optional),
    `limit`(기본 50), `offset`(기본 0).
  - `StudentRepository.list_students(...)` 신설:
    - `deleted_at IS NULL`만.
    - 필터: 전달된 파라미터만 AND 조건. `q`는 `name ILIKE '%q%'`.
    - 정렬: `school, grade, class_no, student_no`.
    - `limit`/`offset` 적용. 전체 개수(`total`)도 함께 반환(필터 동일 조건 count).
  - 각 학생의 `photo_key`가 있으면 `create_signed_url`로 presigned URL 생성. 없으면 `photo_url=null`.
  - 응답: `AdminStudentList { total, items: AdminStudentItem[] }`.

### 1.5 스키마 (`schemas/admin.py` 신설)
- `AdminLoginRequest { username: str, password: str }`
- `AdminLoginResponse { admin_token: str }`
- `AdminStudentItem { id, school, grade, class_no, student_no, name, password, photo_url|null,
  consent_privacy, created_at }`
- `AdminStudentList { total: int, items: list[AdminStudentItem] }`

### 1.6 보안 메모
- 비밀번호(평문)·photo presigned URL은 **admin 토큰 검증 통과 요청에만** 응답.
- 평문 비밀번호가 응답 본문에 포함됨 → 프론트 기본 가림으로 노출 최소화. (정책상 평문 저장은 기존 결정.)
- 학생 사진은 영구 보관 정책([[photo-retention-always-keep]])과 무관하게 조회만 함 — 삭제·폐기 없음.

## 2. 프론트엔드 (Next.js App Router)

### 2.1 라우팅
```
/admin/login    관리자 로그인 (username/password)
/admin          회원 목록 (테이블 + 썸네일 + 검색/필터 + 상세 모달)
```
- `app/admin/layout.tsx`: admin 토큰 가드. 토큰 없으면 `/admin/login`으로 리다이렉트.
  (단 `/admin/login` 자체는 가드 제외 — 로그인 페이지는 별도 처리 또는 layout 분기.)
- 기존 `admin/content`, `admin/stats`는 건드리지 않음.

### 2.2 토큰 저장 & API (`lib/api.ts`)
- 로그인 성공 시 admin JWT를 `localStorage["admin_token"]`에 저장(학생 토큰 키와 분리).
- 추가 함수:
  - `adminLogin(username, password) -> { admin_token }`
  - `fetchAdminStudents(params, token) -> AdminStudentList` — `Authorization: Bearer <admin_token>`.
- 401 응답 시 `ApiError`로 던지고, 화면이 토큰 삭제 후 `/admin/login` 이동.

### 2.3 `/admin` 화면
- 상단: 이름 검색바 + 필터 셀렉트(학교/학년/반) + 총 인원 수 표시.
- 테이블 컬럼: `[썸네일 | 이름 | 학교 | 학년/반/번호 | 가입일 | 비밀번호(토글) | 동의]`.
  - 썸네일: presigned URL을 작은 이미지로. `photo_url` 없으면 플레이스홀더(이니셜/아이콘).
  - 비밀번호 셀: 기본 `••••••`, 눈 아이콘 클릭 시 해당 행만 평문 표시.
- 행 클릭 → 상세 모달(dialog): 큰 사진 + 전체 정보.
- 페이지네이션(`limit`/`offset`) 또는 "더 보기".
- shadcn/ui(table, dialog, input, select, button), Tailwind, Lucide, `cn()` 사용.

## 3. 에러 처리

- 로그인 자격 오류 → 401, "아이디 또는 비밀번호가 올바르지 않습니다".
- admin API 401(만료·무효) → `admin_token` 삭제 후 `/admin/login` 리다이렉트.
- presigned URL 생성 실패는 **개별 학생 단위로 graceful** — 해당 `photo_url`만 `null`, 목록 전체는 정상 응답.
- 빈 목록 / 검색 결과 없음 → 빈 상태 UI("회원이 없습니다").
- 백엔드 `DomainError`/`UnauthorizedError`, 프론트 `parseErrorMessage`/`ApiError`로 통일.

## 4. 테스트

### 백엔드 (pytest, 기존 `tests/` 패턴)
- admin 로그인: 정상 발급 / 잘못된 자격 401 / 만료 토큰 거부.
- `current_admin` 의존성: 토큰 없음·잘못된 kind(학생 토큰) 거부.
- `GET /api/admin/students`: admin 토큰 없으면 401; 있으면 목록·검색(`q`)·필터(school/grade/class)·
  페이지네이션(limit/offset)·soft-delete 제외·정렬 검증.
- `list_students` 레포: 필터·정렬·offset·total count.
- presigned URL은 가짜 `StorageClient`(기존 seam) 주입.

### 프론트
- 큰 E2E는 생략. 핵심 API 함수(`adminLogin`/`fetchAdminStudents`) 동작 위주.

## 범위 밖 (YAGNI)

- 다중 관리자·권한(role) 관리, DB 관리자 테이블.
- 학생 수정·삭제 등 관리 동작.
- `admin/content`, `admin/stats` 페이지 구현.
- 통계·대시보드(`/api/admin/dashboard`, `/stats/keywords`).
