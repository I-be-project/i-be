# 운영진 콘솔 설계

작성일: 2026-08-08
브랜치: `feat/operator-console` (base: `develop`)

## 배경

행사 현장 운영진에게 관리자 콘솔의 **조회 기능만** 열어주는 화면이 필요하다.
지금은 `/admin` 하나뿐이라, 운영진이 현황을 보려면 관리자 계정을 공유해야 하고
그러면 회원 삭제·부스 삭제까지 함께 열린다.

백엔드에는 `TokenKind.OPERATOR`와 `operator_token_ttl_hours` 설정, 그리고
`app/routers/operator.py` stub(`NotImplementedError`)이 이미 자리를 잡고 있다.
이 설계는 그 자리를 채운다.

## 목표

- 운영진 전용 로그인(비밀번호 1개)과 `/operator/*` 화면 제공
- 조회는 관리자와 거의 동일하게, **쓰기(삭제·생성·수정)는 서버가 차단**
- 부스별 참여인원 집계 화면 신설 (관리자 콘솔에도 함께 노출)

## 비목표

- 운영진 계정을 여러 개 발급하거나 부스별 담당자를 지정하는 기능
  (`ops.operators` 테이블 신설은 하지 않는다)
- `operator.py` stub의 `/scan`·`/rewards` — 리워드 적립 기능은 이번 범위 밖.
  stub을 그대로 남긴다
- 감사 로그(`ops.audit_logs`)

## 권한 정책

| 대상 | 관리자 | 운영진 |
|---|---|---|
| 회원 목록 조회·검색·필터·정렬 | O | O |
| 회원 비밀번호 열람 | O | O |
| 회원 사진 열람 | O | O |
| 회원 상세(진행 단계·페르소나·카드) | O | O |
| 회원 상세의 **설문 답변 전문** | O | **X** |
| 회원 삭제·선택 삭제 | O | **X** |
| 진행 현황(좌석표) | O | O |
| 부스 목록·코드·QR 조회 | O | O |
| 부스 추가·수정·삭제 | O | **X** |
| 부스별 참여인원 | O | O |

운영진에게 비밀번호·사진을 여는 것은 의도된 결정이다. 현장에서 가장 흔한 문의가
"비밀번호를 잊었다"인데, 이걸 막으면 모든 문의가 관리자 한 명에게 몰린다.

설문 답변 전문만 제외하는 이유는 운영 업무에 쓸 일이 없기 때문이다. 이는 UI 숨김이
아니라 **응답 자체에서 제외**한다.

---

## 백엔드

### 로그인

`config.py`

```python
# 운영진(단일 공유 비밀번호) — 아이디 없이 비밀번호만 입력받는다.
operator_password: str = "change-me-operator"
# operator_token_ttl_hours: int = 12  (이미 존재)
```

`_PRODUCTION_REQUIRED_SETTINGS`에 `"operator_password": "OPERATOR_PASSWORD"`를 추가한다.

`app/services/operator_service.py` (신설)

```python
class OperatorService:
    def authenticate(self, password: str) -> str:
        """운영진 공유 비밀번호 검증 후 operator 토큰 발급."""
        # 타이밍 공격 완화 — AdminService.authenticate와 같은 방식.
        if not secrets.compare_digest(password, self._settings.operator_password):
            raise UnauthorizedError("비밀번호가 올바르지 않습니다.")
        return create_token(
            kind=TokenKind.OPERATOR,
            subject="operator",
            ttl=timedelta(hours=self._settings.operator_token_ttl_hours),
            settings=self._settings,
        )
```

`POST /api/operator/login`

```
요청  { "password": "..." }
응답  { "operator_token": "..." }
실패  401 "비밀번호가 올바르지 않습니다."
```

### 권한 가드

`decode_token`은 단일 `expected_kind`만 받는다. admin·operator 모두 `jwt_secret`을
쓰므로, `deps.py`에 두 종류를 차례로 시도하는 가드를 추가한다. 공용 헬퍼
(`core/security.py`)는 건드리지 않는다.

```python
def current_staff(credentials, settings) -> str:
    """admin 또는 operator 토큰을 허용하고 역할("admin"|"operator")을 반환.

    조회 전용 엔드포인트에만 쓴다. 쓰기 엔드포인트는 CurrentAdminDep을 유지해야
    운영진 토큰으로 직접 API를 호출해도 막힌다.
    """
    if credentials is None:
        raise UnauthorizedError("인증 토큰이 필요합니다.")
    for kind in (TokenKind.ADMIN, TokenKind.OPERATOR):
        try:
            decode_token(credentials.credentials, expected_kind=kind, settings=settings)
        except jwt.PyJWTError:
            continue
        return kind.value
    raise UnauthorizedError("유효하지 않은 토큰입니다.")


CurrentStaffDep = Annotated[str, Depends(current_staff)]
```

### 엔드포인트 가드 매핑

| 엔드포인트 | 변경 후 |
|---|---|
| `GET /api/admin/students` | `CurrentStaffDep` |
| `GET /api/admin/students/schools` | `CurrentStaffDep` |
| `GET /api/admin/students/{id}` | `CurrentStaffDep` |
| `GET /api/admin/students/{id}/photo-url` | `CurrentStaffDep` |
| `GET /api/admin/progress/classes` | `CurrentStaffDep` |
| `GET /api/admin/booths` | `CurrentStaffDep` |
| `GET /api/admin/booths/stats` (신규) | `CurrentStaffDep` |
| `DELETE /api/admin/students/{id}` | `CurrentAdminDep` (유지) |
| `POST /api/admin/students/bulk-delete` | `CurrentAdminDep` (유지) |
| `POST`·`PATCH`·`DELETE /api/admin/booths` | `CurrentAdminDep` (유지) |

경로 접두사는 `/api/admin/*`을 그대로 쓴다. 조회 응답 스키마와 서비스가 이미 있어
중복 없이 재사용하기 위함이고, 실제 권한 경계는 URL이 아니라 가드가 정한다.

### 설문 답변 제외

`AdminService.get_student_detail(student_id, *, include_answers: bool = True)`에
인자를 추가한다. 라우터에서 역할로 결정한다.

```python
@router.get("/students/{student_id}", response_model=AdminStudentDetail)
async def student_detail(student_id, role: CurrentStaffDep, admin: AdminServiceDep):
    # 운영진에게는 설문 답변 원문을 내려보내지 않는다(UI 숨김이 아니라 응답에서 제외).
    return await admin.get_student_detail(student_id, include_answers=(role == "admin"))
```

`include_answers=False`면 `AdminSessionDetail.answers`를 빈 리스트로 채운다.
스키마는 그대로 두어 응답 형태가 역할에 따라 달라지지 않게 한다.

### 부스별 참여인원

`BoothVisitRepository.count_by_booth()` 신설.
`(student_id, booth_id)`에 unique 제약이 있어 부스별 `count(*)`가 곧 방문 학생 수다.

```sql
select b.id, b.code, b.name, count(v.id) as visit_count
  from ops.booths b
  left join ops.booth_visits v on v.booth_id = b.id
 group by b.id, b.code, b.name
 order by b.created_at
```

`left join`이라 방문이 0인 부스도 0명으로 나온다.

`unique_students`는 별도 집계다.

```sql
select count(distinct student_id) from ops.booth_visits
```

`GET /api/admin/booths/stats`

```json
{
  "booths": [
    { "booth_id": "...", "code": "A3K9QZ", "name": "AI 체험", "visit_count": 87 }
  ],
  "total_visits": 342,
  "unique_students": 128
}
```

`total_visits`는 `visit_count`의 합(연인원), `unique_students`는 부스를 하나라도
찍은 학생 수(중복 제거)다. 두 값의 의미가 다르므로 화면에서도 구분해 표기한다.

라우터는 `booths.py`(prefix `/api/admin/booths`)에 둔다. 기존 `/{booth_id}`는
PATCH·DELETE뿐이라 `GET /stats`와 경로 충돌이 없다.

### 테스트

- `test_operator_router.py` — 로그인 성공/실패, 발급 토큰의 `kind == "operator"`
- `test_staff_guard.py` — 운영진 토큰으로 조회 200 / 삭제 401, 학생 토큰은 전부 401,
  토큰 없음 401
- `test_booth_stats.py` — 집계 정확성, 방문 0인 부스 포함,
  `total_visits`와 `unique_students` 구분
- `test_admin_service.py` — `include_answers=False`일 때 `answers == []`
- 기존 `test_admin_router.py`·`test_booths_router.py`는 관리자 경로 회귀 확인

---

## 프론트엔드

회원 목록(743줄)·좌석표를 복사하면 두 벌을 영원히 동기화해야 한다. 화면 본문을 공유
컴포넌트로 올리고 라우트 페이지는 껍데기만 둔다.

### 콘솔 컨텍스트

`components/console/ConsoleProvider.tsx` (신설)

```ts
interface ConsoleValue {
  role: "admin" | "operator";
  getToken: () => string | null;
  clearToken: () => void;
  loginPath: string;   // "/admin/login" | "/operator/login"
  basePath: string;    // "/admin" | "/operator"
}
```

`/admin/layout.tsx`와 `/operator/layout.tsx`가 각자 값을 제공하고, 공유 컴포넌트는
`useConsole()`로 읽는다. 지금 `StudentDetailSidebar`가 `getAdminToken()`과
`/admin/login`을 하드코딩한 부분이 이걸로 해소되고, 페이지마다 토큰을 prop으로
흘려보내지 않아도 된다.

`lib/operatorAuth.ts`는 `operator_token` 키를 쓴다 — admin(`admin_token`)과 키를
분리해 한쪽 로그아웃이 다른 쪽에 영향을 주지 않는다.

### 파일 이동 (`git mv`로 이력 보존)

| 이동 | 사유 |
|---|---|
| `components/admin/StudentDetailSidebar.tsx` → `components/console/` | 양쪽 공유 |
| `components/admin/ProgressBadge.tsx` → `components/console/` | 순수 표시용 |
| `components/admin/BoothQrDialog.tsx` → `components/console/` | 순수 표시용 |
| `components/admin/AdminHeader.tsx` → `components/console/ConsoleHeader.tsx` | 내비·타이틀을 role에서 결정 |
| `components/admin/BoothFormDialog.tsx` | **이동 안 함** — 부스 추가/수정은 관리자 전용 |

`ConsoleHeader`의 타이틀과 내비는 role로 결정한다.

| role | 타이틀 | 내비 |
|---|---|---|
| `admin` | 관리자 콘솔 | 회원 목록 · 진행 현황 · 부스 관리 · 부스별 참여인원 |
| `operator` | 운영진 콘솔 | 회원 목록 · 진행 현황 · 부스 확인 · 부스별 참여인원 |

`href`는 `basePath` 기준으로 만든다(`` `${basePath}/seating` `` 등). 활성 표시는 지금과
같이 `pathname === href` 비교를 쓴다.

### 공유 뷰 (`components/console/`)

기존 admin 페이지 본문을 그대로 옮기고, 쓰기 UI만 role로 가린다.

| 컴포넌트 | 출처 | 관리자 전용으로 가릴 것 |
|---|---|---|
| `StudentListView` | `app/admin/page.tsx` | 선택 체크박스, 선택 삭제 툴바, 삭제 확인 다이얼로그 |
| `SeatingView` | `app/admin/seating/page.tsx` | 없음 |
| `BoothListView` | `app/admin/booths/page.tsx` | 부스 추가·수정·삭제 버튼 (QR 버튼은 양쪽) |
| `BoothStatsView` | 신규 | 없음 |
| `StudentDetailSidebar` | 이동 | 회원 삭제 섹션, 설문 답변 블록 |

설문 답변 블록은 서버가 이미 `answers=[]`로 내려주지만, 빈 배열이면 "저장된 답변이
없습니다"로 보여 오해를 부른다. 운영진 화면에서는 섹션 자체를 렌더하지 않는다.

### 라우트

```
/operator/login      비밀번호 입력 1칸 (아이디 없음)
/operator            회원 목록       → StudentListView
/operator/seating    진행 현황       → SeatingView
/operator/booths     부스 확인·QR    → BoothListView
/operator/visits     부스별 참여인원 → BoothStatsView
/admin/visits        부스별 참여인원 → BoothStatsView (관리자 내비에도 추가)
```

`/operator/layout.tsx`는 기존 `/admin/layout.tsx`와 같은 패턴을 따른다 — 토큰이
localStorage에만 있어 마운트 후에야 인증 여부를 알 수 있으므로, `ready` 이전에는
아무것도 렌더하지 않는다.

### API 클라이언트 (`lib/api.ts`)

```ts
export function operatorLogin(password: string): Promise<{ operator_token: string }>;
export function fetchBoothStats(token: string): Promise<BoothStats>;
```

기존 `fetchAdminStudents` 등은 토큰을 인자로 받으므로 그대로 재사용한다.
이름에 `Admin`이 남지만 실제 호출 주체는 컨텍스트가 정한다.

---

## 검증

- 백엔드: `uv run ruff check .` · `ruff format --check .` · `mypy app` · `pytest`
- 프론트: `npm run lint` · `npm run build`
- 수동: 관리자 콘솔 3개 화면이 리팩터 후에도 그대로 동작하는지 확인.
  **이번 작업의 주요 회귀 위험은 신규 기능이 아니라 기존 admin 화면이다.**
- 수동: 운영진 토큰으로 로그인 후 브라우저 콘솔에서
  `DELETE /api/admin/students/{id}` 직접 호출 → 401 확인

## 배포 순서 (중요)

`operator_password`를 `_PRODUCTION_REQUIRED_SETTINGS`에 넣으므로, 서버
`backend/.env`에 `OPERATOR_PASSWORD`가 없는 상태로 `production`에 머지되면
**앱 기동이 실패한다**. `backend/**` 변경은 push 즉시 자동 재배포되므로 순서를 지킨다.

1. 서버 `backend/.env`에 `OPERATOR_PASSWORD=...` 추가
2. PR을 `production`에 머지
3. `https://api.cnu-likelion.kr/healthz` 확인
