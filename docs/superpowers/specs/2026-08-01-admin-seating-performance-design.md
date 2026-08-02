# 관리자 진행 현황(좌석표) 성능 개선 설계

작성일: 2026-08-01

## 배경

관리자 화면의 **진행 현황(반별 좌석표, `/admin/seating`)**에서 학교를 선택하면 응답이
수십 초 걸린다. 회원 목록(`/admin`)도 페이지 이동마다 눈에 띄게 느리다.

## 문제 분석

### 현재 동작

좌석표는 학교가 정해지는 순간 그 학교 **학생 전원**을 한 번에 받아온다.

```ts
// frontend/app/admin/seating/page.tsx:127
const res = await fetchAdminStudents(token, { school: target, limit: 1000, sort: "name_asc" });
```

페이지 진입 시 첫 학교가 자동 선택되므로(`seating/page.tsx:155-158`) 클릭 전에 이미 실행된다.

학년·반 목록에 네트워크 호출이 따로 없는 이유가 여기 있다. 받아온 학생 배열에서 역산한다.

```ts
// frontend/app/admin/seating/page.tsx:160
const grades = [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b);
```

즉 **학년·반 드롭다운을 만들기 위해 학생 832명을 통째로 받는 구조**다.

백엔드는 그 832명 각각에 대해 사진 presigned URL을 순차 생성한다.

```python
# backend/app/services/admin_service.py:99
for r in records:
    photo_url = await self._signed_url(r.photo_key)
```

그리고 `create_signed_url`은 호출마다 aioboto3 Session과 S3 클라이언트를 새로 조립한다.

```python
# backend/app/adapters/storage_client.py:93
async def create_signed_url(self, key: str, *, ttl_seconds: int) -> str:
    async with self._client_factory() as s3:          # 매 호출마다 새로 생성
        url = await s3.generate_presigned_url(...)
    return url
```

### 실측 (2026-08-01, 실제 Supabase 데이터)

전체 22개 학교, 최대 학교 832명(사진 보유 703명) 기준. 학교별 학생 수는
832 / 397 / 274 / 162 / 66명 순.

**학교 클릭 1회의 구간별 비용**

| 구간 | 시간 |
|---|---|
| 학생 목록 쿼리 (count + 조회, 832행) | 117 ms |
| 진행도 쿼리 (832명) | 329 ms |
| **사진 presigned URL 703건** | **≈ 31 초** |
| 응답 크기 | 600 KB |

presign 건당 44 ms이며 **워밍업 효과가 아니다.** 개별 호출 12회를 측정한 결과
`60 38 50 38 46 43 39 51 39 51 38 48 ms` 로 정상 상태에서도 40~50 ms대를 유지한다.
비용의 정체는 서명 연산이 아니라 클라이언트 조립이다 — 클라이언트 하나로 703건을
서명하면 **179 ms(건당 0.254 ms)**로, 175배 차이다.

**대안 구조의 측정치**

| | 시간 | 응답 |
|---|---|---|
| 반별 집계 1쿼리 (31행) | 86 ms | 2.9 KB |
| 반 1개 로드 (29명) | 140 ms | 22 KB (사진 URL 포함) / 약 12 KB (제외) |
| 학교 전원, 사진 제외 | 446 ms | 344 KB |

반 1개의 140 ms는 목록 101 ms + 진행도 39 ms이며 서명은 포함하지 않는다. 응답 크기는
presigned URL이 1건당 375자라 29명이면 그것만 약 11 KB를 차지한다 — 사진을 빼면 12 KB로
줄어든다.

DB 시간은 로컬에서 Supabase까지의 왕복을 포함한 값이라 서버에서는 더 짧을 수 있다.
presign은 순수 CPU 연산이므로 서버에서도 동일하다.

### 근본 원인

**만들어진 사진 URL의 대부분이 쓰이지 않는다.**

| 화면 | 서명 건수 | 실제 사용 |
|---|---|---|
| 좌석표 (학교 1개) | 703건 | **0건** — 격자는 번호·이름·상태만 그린다 |
| 회원 목록 (1페이지) | 50건 | 관리자가 클릭한 것만 (보통 0~2건) |
| 상세 다이얼로그 | 목록에서 받은 값 재사용 | 1건 |

회원 목록의 아바타는 기본적으로 **숨겨져 있다**. `revealed`일 때만 `<img>`를 그리고
평소엔 아이콘 플레이스홀더다(`app/admin/page.tsx:82-94`).

또한 상세 다이얼로그가 부르는 `GET /students/{id}` 응답에는 이미 `photo_url`이
들어있는데(`schemas/admin.py:93`, `admin_service.py:158`) 다이얼로그는 그것을 쓰지 않고
목록에서 받은 prop을 쓴다(`StudentDetailDialog.tsx:254`). 클릭한 학생 한 명당 사진을
두 번 서명하고 하나를 버린다.

### 부수적으로 발견한 잠재 버그

`limit: 1000` 이 하드코딩돼 있는데 최대 학교가 이미 832명 — 정원의 83%다. 한 학교가
1000명을 넘으면 **에러 없이 조용히 잘려** 일부 학생이 좌석표에 나타나지 않는다.

## 제약 — 외부 API 계약

`GET /api/admin/students`의 `items[].photo_url`은 **외부에 공개된 계약**이다.

- `docs/2026-07-31-admin-api-usage.md`(외부 전달용)에 응답 예시와 필드 표로 문서화
- `backend/scripts/export_students.py`가 이 필드로 사진을 일괄 다운로드
- `backend/tests/test_export_students_script.py`가 그 동작을 검증
- 2026-07-31 커밋으로 CORS를 전 오리진 개방하여 배포된 상태

따라서 **필드를 제거하지 않는다.** 대신 옵트아웃 파라미터를 두어 관리자 UI만 서명을
건너뛴다. 필드 추가(`has_photo`)는 하위 호환이므로 안전하다.

## 설계

### 변경 1 — 목록 응답의 사진 서명을 옵트아웃 가능하게

**API**

```
GET /api/admin/students?...&include_photo=false
```

`include_photo: bool = True` — 기본값이 참이므로 기존 호출자(외부 스크립트 포함)는
영향을 받지 않는다. 관리자 UI는 항상 `false`로 호출한다.

**스키마** (`schemas/admin.py`)

`AdminStudentItem`에 `has_photo: bool` **추가**. `photo_url`은 유지하되
`include_photo=false`면 항상 `null`이 된다. UI는 `has_photo`로 이니셜/아이콘을
구분하므로 URL 없이도 아바타를 올바르게 그린다.

**서비스** (`admin_service.py:88-117`)

`include_photo`가 거짓이면 `_signed_url` 루프를 건너뛴다. 이때 `list_students`의
학생 조립 루프에는 `await`가 남지 않는다.

**신규 엔드포인트 — 아바타 클릭용 단건**

```
GET /api/admin/students/{student_id}/photo-url  →  { "photo_url": string | null }
```

세그먼트가 하나 더 있어 `/students/{student_id}`와 충돌하지 않는다
(`admin.py:54-55`의 라우트 순서 주의는 이 경로에 해당하지 않는다).
학생이 없으면 404, 사진이 없으면 200 + `null`. 응답 모델은 `AdminStudentPhoto`.

### 변경 2 — 반별 진행 집계 엔드포인트

**API**

```
GET /api/admin/progress/classes?school=<학교명>
→ [{ grade, class_no, total, completed, in_progress, not_started }, ...]
```

`/students/...`와 다른 경로 그룹이라 UUID 경로 매칭 함정을 아예 피한다.
응답 모델 `AdminClassProgress`의 리스트.

**리포지토리** — `StudentRepository.get_class_progress(school)`

```sql
select s.grade, s.class_no,
       count(*) as total,
       count(*) filter (where ls.status = 'completed')            as completed,
       count(*) filter (where ls.status is not null
                          and ls.status <> 'completed')           as in_progress,
       count(*) filter (where ls.status is null)                  as not_started
from pii.students s
left join lateral (
    select status from generated.sessions se
    where se.student_id = s.id order by se.created_at desc limit 1
) ls on true
where s.school = $1 and s.deleted_at is null
group by s.grade, s.class_no
order by s.grade, s.class_no
```

인덱스는 이미 갖춰져 있다. `students_login_key (school, grade, class_no, student_no)
where deleted_at is null`가 `school=?` 범위 스캔을 받고, `sessions_student_recent
(student_id, created_at desc)`가 LATERAL의 최근 세션 조회를 받는다. 새 인덱스는 필요 없다.

`abandoned` 등 미지의 상태를 `in_progress`로 수렴시키는 규칙은 기존
`_to_progress`(`admin_service.py:216`)와 일치시킨다.

이 저장소의 **첫 스키마 교차 쿼리**(`pii` ← `generated`)다. 집계 기준 테이블이
`pii.students`이므로 `StudentRepository`에 두며, 그 근거를 코드 주석으로 남긴다.

### 변경 3 — StorageClient 클라이언트 재사용

변경 1로 관리자 UI 경로에서는 서명이 사라지지만, **`include_photo=true`인 외부 경로는
여전히 832명 → 31초**다. 또한 학생 상세 조회는 사진 1건 + 세션당 카드 이미지 1건을
순차 서명한다(세션 3개면 4 × 44 ms ≈ 176 ms).

`StorageClient`에 여러 건용 메서드를 추가한다. 기존 단건 `create_signed_url`은
호출부가 남아 있으므로 그대로 둔다.

```python
async def create_signed_urls(self, keys: list[str], *, ttl_seconds: int) -> dict[str, str]:
    """여러 key를 클라이언트 하나로 서명해 {key: url}로 돌려준다.

    개별 key가 실패하면 그 key만 결과에서 빠진다(기존 _signed_url의 graceful 동작 유지).
    """
    if not keys:
        return {}
    urls: dict[str, str] = {}
    async with self._client_factory() as s3:          # 전 건에 대해 딱 1번
        for key in dict.fromkeys(keys):               # 중복 key는 한 번만
            try:
                urls[key] = await s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": key},
                    ExpiresIn=ttl_seconds,
                )
            except Exception:
                continue
    return urls
```

`list_students`(사진 포함 시)와 `get_student_detail`이 이것을 쓴다. 703건 기준
31초 → 0.18초.

### 변경 4 — 프론트엔드 좌석표 (`app/admin/seating/page.tsx`)

상태를 재구성한다.

| 기존 | 변경 후 |
|---|---|
| `students` — 학교 전원 832명 | `classProgress` — 집계 31행 |
| | `classStudents` — 선택한 반 29명 |

- 학교 선택 → `fetchAdminClassProgress(school)`
- `grades` = 집계 행에서 distinct grade (`students.map` 역산 제거)
- 반 카드의 `18/32` 배지 = 집계 행의 `completed` / `total`
- 학년·반이 확정되면 → `fetchAdminStudents({ school, grade, class_no, limit: 100, include_photo: false })`
- 요약 바: 완료/진행중/미시작은 집계 행에서, 미가입은 `maxNo - total`
- 학생 삭제 후(`onDeleted`)에는 집계와 현재 반을 **둘 다** 재조회
- **`limit: 1000` 제거**

### 변경 5 — 프론트엔드 회원 목록 · 상세 다이얼로그

- `StudentAvatar`(`app/admin/page.tsx:56`): `photo_url` → `has_photo`로 분기.
  펼칠 때 `fetchAdminStudentPhotoUrl(id)`로 그 학생 것만 받아 상태에 담는다.
- 회원 목록의 `fetchAdminStudents` 호출에 `include_photo: false` 추가.
- `StudentDetailDialog`: 사진을 prop이 아니라 **`detail.photo_url`**에서 읽는다
  (`:250-257`). 응답에 이미 있으므로 백엔드 작업은 없다. `detail` 로딩 중에는
  플레이스홀더를 보인다.
- `lib/api.ts`: `AdminStudentItem`에 `has_photo: boolean` 추가(`:251`),
  `fetchAdminClassProgress`·`fetchAdminStudentPhotoUrl` 추가,
  `fetchAdminStudents`에 `include_photo` 옵션 추가.
- `ProfileStudent.photo_url`(`:63`, 학생 프로필용)과
  `AdminStudentDetail.photo_url`(`:294`)은 건드리지 않는다.

## 테스트

`backend/tests/`는 fake 주입 방식이라 DB에 접속하지 않는다. **집계 SQL 자체는 단위
테스트로 검증되지 않는다**는 경계를 인정하고 그 위 계층을 덮는다.

- `test_admin_service.py`
  - `include_photo=false`일 때 스토리지 서명이 **한 번도 호출되지 않음**
  - `has_photo`가 `photo_key` 유무를 정확히 반영
  - `include_photo=true`(기본)일 때 기존 동작이 유지됨 — 회귀 방지
- `test_admin_router.py`
  - `GET /progress/classes` 응답 형태와 학교 필터
  - `GET /students/{id}/photo-url` 200 / 404
- `test_export_students_script.py` — 기존 테스트가 그대로 통과해야 한다(계약 유지 확인)
- 집계 SQL 결과는 실측 스크립트로 육안 확인 (최대 학교에서 31행 = 학년·반 조합)

## 기대 효과

최대 학교 832명 기준, 실측값 기반 추정.

| | 현재 | 변경 후 |
|---|---|---|
| 좌석표 학교 선택 | **31.5 초** / 600 KB | **86 ms** / 2.9 KB |
| 좌석표 반 선택 | 0 ms (메모리 필터) | 140 ms / 약 12 KB |
| 회원 목록 1페이지 | +2.2 초 (서명 50회) | 서명 0회 |
| 외부 API (`include_photo=true`) | 31.5 초 | **0.6 초** (변경 3) |
| 1000명 초과 학교 | 조용히 잘림 | 해당 없음 |

부수 효과로 보고 있지 않은 20여 개 반 800여 명의 **이름·평문 비밀번호가 브라우저로
전송되지 않는다.**

## 트레이드오프

반을 클릭할 때마다 요청이 발생한다(0 ms → 140 ms). 전체를 미리 받아두지 않는 대가다.
학교 선택이 31.5초에서 86 ms가 되는 것과 맞바꾸므로 전체 체감은 크게 개선된다.
같은 반을 반복해서 열어보는 사용 패턴이 문제가 되면 프론트엔드 캐시를 나중에
검토한다 — 진행도는 계속 변하므로 캐시를 그리고 뒤에서 재검증하는 방식이어야 한다.
지금은 넣지 않는다.

## 범위 밖

- 좌석표 자동 갱신/폴링 — 현재 수동 새로고침 유지
- `GET /api/admin/students`의 `limit` 상한 검증 (외부 가이드에 이미 리스크로 기록됨)
- 외부 API 소비자를 위한 반별 집계 노출

## 검증

```bash
# backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest
# frontend
npm run lint && npm run build
```

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-01 | 최초 작성 |
