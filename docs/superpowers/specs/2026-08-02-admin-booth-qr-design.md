# 관리자 부스 관리 + 부스별 QR 발급 설계

작성일: 2026-08-02

## 배경

행사장 체험 부스를 관리자가 등록하고, 부스마다 QR을 발급해 인쇄물로 걸어둔다.
학생은 나중에 앱 안에서 카메라를 켜 그 QR을 찍고 부스 체험 완료 인증을 받는다.

현재 상태:

- 부스 개념이 DB·API 어디에도 없다 (마이그레이션 `0001`~`0006`에 부스 관련 테이블 없음).
- `app/routers/admin.py:126`의 `dashboard`에 "부스별 체험 현황" 주석만 있고 `NotImplementedError`.
- `app/routers/operator.py`의 `scan`·`rewards`도 뼈대만 있고 미구현.
- 원래 기획(`frontend/docs/plan.md:392`)은 **운영자가 학생 카드 QR을 스캔**하는 반대 방향이었다.
  이번 설계는 **학생이 부스 QR을 스캔**하는 방향으로 간다.

## 범위

이번 작업은 **관리자 쪽 부스 CRUD와 링크·QR 발급까지**다.
학생 스캔·인증 흐름은 다음 단계이며, 여기서 정한 `code`로 이어붙는다.

## 1. QR 링크 형식

```
https://i-be.vercel.app/b/K7M2QX
```

- 경로는 `/b/` + 6자 코드.
- 전체 32자. ECC 레벨 M 기준 QR 버전 3(29×29)에 들어간다.
  인쇄물이 훼손될 여지가 크면 ECC를 Q로 올려도 버전 4(33×33)라 여전히 작다.
  셀이 클수록 현장 조명·거리 조건에서 스캔이 잘 되므로 링크를 짧게 유지하는 것이 목적이다.

### 왜 코드 문자열이 아니라 URL인가

학생은 앱 안 스캐너로 찍는 것이 기본 경로라, QR에 `K7M2QX`만 넣어도 동작은 한다.
그럼에도 URL로 하는 이유:

1. **기본 카메라 앱 폴백.** 학생이 앱을 안 열고 폰 기본 카메라로 찍는 경우가 반드시 생긴다.
   URL이면 웹페이지가 열려 "로그인하고 인증하기"로 이어갈 수 있다. 코드 문자열이면 이 경로가 완전히 죽는다.
2. **인쇄물 재제작 불가.** QR은 한 번 인쇄해 걸면 되돌릴 수 없다. 폴백이 열려 있는 쪽을 택한다.

### 파싱 규칙 (다음 단계에서 구현할 스캐너용)

스캐너는 **도메인을 검증하지 않고 코드만 추출**한다.

1. 스캔 결과에 정규식 `/\/b\/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})/` 매칭 → 캡처된 6자를 코드로 사용.
2. 매칭 실패 시, 입력 전체를 대문자로 바꿔 6자 코드 형식이면 그대로 코드로 사용
   (수동 입력 폴백과 같은 경로).
3. 둘 다 실패하면 "부스 QR이 아니야" 안내.

도메인을 검증하지 않는 이유: Vercel 프리뷰 도메인, 커스텀 도메인 전환, 로컬 개발에서
같은 인쇄물이 계속 동작해야 한다. 위조 방지를 하지 않기로 했으므로(아래) 도메인 검증에 보안상 의미도 없다.

### 위조 방지는 하지 않는다

QR을 사진 찍어 친구에게 보내면 부스에 가지 않고도 인증할 수 있다. 이를 막지 않는다.

- 회전 토큰(30초 만료)은 부스마다 화면·네트워크가 상시 필요해 운영 부담이 크고, 인쇄물로는 불가능하다.
- HMAC 서명은 URL 변조만 막을 뿐 사진 공유는 못 막는다. 코드가 추측 불가능한 랜덤이면 사실상 동일한 효과다.

학교 행사 규모에서 정적 코드로 충분하다는 판단이다.

## 2. 코드 발급

- 알파벳: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31자).
  혼동 문자 `0 O 1 I L`을 제외해 인쇄물을 보고 손으로 입력할 수 있게 한다.
- 길이 6자 → 31⁶ ≈ 8.9억 조합. 추측으로 유효 코드를 찾기 어렵다.
- 생성은 `secrets.choice`로 서버에서. `unique` 제약 위반 시 최대 5회 재시도, 그래도 실패하면 409(`ConflictError`).
- **한 번 발급된 코드는 불변.** 인쇄물이 이미 현장에 나가 있기 때문이다.
  수정 API는 `name`·`description`만 받고 `code`는 받지 않는다.

## 3. 데이터 모델

`backend/supabase/migrations/0007_create_booths.sql` — 운영 데이터이므로 기존 `ops` 스키마에 둔다.

```sql
-- ops.booths — 행사장 체험 부스. 부스마다 고유 code를 갖고, 그 code로 QR 링크를 만든다.
-- code는 인쇄물에 박히므로 발급 후 변경하지 않는다(수정 API에서 제외).

create table if not exists ops.booths (
    id          uuid        primary key default gen_random_uuid(),
    code        text        not null unique,
    name        text        not null,
    description text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
```

`is_active` 같은 노출 스위치는 넣지 않는다. 부스를 막는 수단은 삭제뿐이다.
행사 당일 "준비 중이라 잠깐 막기"가 필요해지면 그때 컬럼을 추가한다.

다음 단계에서 붙을 `ops.booth_visits`는 이번 범위가 아니다.

## 4. API

`backend/app/routers/booths.py` (신규). prefix `/api/admin/booths`, 전부 `CurrentAdminDep`.

| 메서드 | 경로 | 요청 | 설명 |
|---|---|---|---|
| `POST` | `/api/admin/booths` | `{ name, description? }` | 생성. `code` 자동 발급 |
| `GET` | `/api/admin/booths` | — | 전체 목록 (`created_at` 오름차순) |
| `PATCH` | `/api/admin/booths/{booth_id}` | `{ name?, description? }` | 수정. `code` 변경 불가 |
| `DELETE` | `/api/admin/booths/{booth_id}` | — | 삭제 |

응답 스키마 `BoothResponse`:

```json
{
  "id": "3f2a9c81-...",
  "code": "K7M2QX",
  "name": "드론 체험",
  "description": "드론을 직접 조종해보는 부스",
  "qr_url": "https://i-be.vercel.app/b/K7M2QX",
  "created_at": "2026-08-02T09:00:00Z"
}
```

- `name`은 필수, 공백만 있는 값은 거부(`min_length=1` + strip).
- `description`은 선택. 부스를 여러 개 연달아 등록할 때 막히지 않게 하려는 의도다.
- `qr_url`은 서버가 조립해서 내려준다 (근거는 6절).
- `GET` 목록에 페이지네이션을 두지 않는다. 부스는 행사당 수십 개 규모라 전체를 한 번에 내려준다.
  `/api/admin/students`와 달리 사진 서명 같은 무거운 작업도 없다.
- `PATCH` 요청 스키마에 `code` 필드 자체가 없다. Pydantic 기본 동작대로 넘어와도 무시된다.

### 레이어

기존 admin 계층 패턴을 그대로 따른다.

- `app/repositories/booth_repo.py` — `BaseRepository` 상속, asyncpg 직접 쿼리.
- `app/services/booth_service.py` — 코드 발급·재시도, `qr_url` 조립.
- `app/schemas/booths.py` — 요청·응답 Pydantic 모델.
- `app/deps.py`에 `BoothServiceDep` 추가, `app/main.py`에 라우터 등록.

## 5. 관리자 화면

`frontend/app/admin/booths/page.tsx` (신규).

- 부스 목록 테이블: 이름 · 설명 · 코드 · QR.
- "부스 추가" 폼 — 이름, 설명 두 칸.
- 행에서 QR 미리보기 → **PNG 다운로드**(1024px, 인쇄용) + 링크 복사.
- 수정·삭제.

QR 렌더는 프론트에서 `qrcode` npm 패키지로 canvas에 그린다. 백엔드에 이미지 의존성을 늘리지 않는다.
`qrcode` + `@types/qrcode`를 `npm install`로 추가하고 `package-lock.json`을 함께 커밋한다.

**PNG에는 코드 6자를 QR 아래에 같이 그려 넣는다.** 카메라가 안 잡힐 때 학생이 손으로 입력할 수 있어야
2절의 혼동 문자 제외가 의미를 갖는다.

### 관리자 내비게이션

내비는 `frontend/components/admin/AdminHeader.tsx:10`의 `NAV` 배열에 이미 있다
(`/admin` 회원 목록, `/admin/seating` 진행 현황). 여기에 `/admin/booths` 항목 하나를 추가한다.
새 화면도 기존 두 화면처럼 `<AdminHeader />`를 상단에 둔다.

## 6. 백엔드 설정 — QR base URL

`app/config.py:36`의 `frontend_origin`을 QR base URL로 쓴다.

이 설정은 현재 **선언만 되어 있고 어디서도 사용되지 않는다**
(`.env.example:39`에 "CORS와 무관"이라고 명시). 새 환경변수를 만들지 않고 이것을 채운다.

`qr_url = f"{settings.frontend_origin.rstrip('/')}/b/{code}"`

**프론트가 `window.location.origin`으로 조립하지 않는 이유**: 관리자가 로컬 개발 서버에서 QR을 뽑아
인쇄하면 `http://localhost:3000/b/...`가 그대로 박힌다. 인쇄물은 되돌릴 수 없으므로
base URL은 서버 설정 한 곳에서만 정한다.

### 배포 시 필요한 조치

- 서버 `backend/.env`에 `FRONTEND_ORIGIN=https://i-be.vercel.app` 추가 (현재 미설정 → 기본값이 localhost).
- `.env.example`의 해당 줄 주석을 "QR 링크 base URL"로 갱신.
- `app_env == "production"`인데 `frontend_origin`이 localhost면 기동을 거부하는 가드를 추가한다.
  기존 시크릿 예시값 가드와 같은 자리·같은 방식이다. localhost가 박힌 QR을 인쇄하는 사고를 막는 것이 목적이다.

## 7. 테스트

`backend/tests/`에 라우터·서비스 단위 테스트를 추가한다 (기존 관례 유지).

- 생성 → `code`가 6자이고 허용 알파벳만 쓰는지, `qr_url`이 `frontend_origin` 기준으로 조립되는지.
- 목록·수정·삭제의 정상 경로.
- `PATCH`에 `code`를 실어 보내도 무시되고 기존 코드가 유지되는지.
- `name`이 빈 문자열·공백만일 때 422.
- 코드 충돌 시 재시도 후 성공하는지 (리포지토리 목킹).
- 관리자 토큰 없이 호출 시 401.

## 8. 범위 밖 — 다음 단계

이번에 정한 `code` 하나로 아래가 전부 이어진다.

- 학생 앱 내부 QR 스캐너 (카메라 권한, 2절 파싱 규칙, 수동 입력 폴백).
- `/b/[code]` 페이지 — 로그인 상태면 바로 인증, 아니면 로그인 후 이어가기.
- `ops.booth_visits` 테이블 + `POST /api/booths/{code}/check-in` (학생당 부스당 1회, unique 제약).
- 관리자 대시보드의 부스별 체험 현황 (`admin.py:126`의 미구현 자리).
