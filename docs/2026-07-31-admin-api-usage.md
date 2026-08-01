# 관리자 API 사용 설명서 (2026-07-31)

외부 시스템에서 **학생 정보와 사진을 조회**하기 위한 API 문서. 이 문서 하나로 연동이 끝나도록 구성했다.

- Base URL: `https://api.cnu-likelion.kr`
- 인증: 관리자 계정 로그인 → Bearer 토큰
- 응답 형식: JSON (UTF-8)
- 대화형 스펙: `https://api.cnu-likelion.kr/docs` (Swagger UI)

---

## 1. 3분 요약

```
① POST /api/admin/login              → admin_token 발급 (12시간 유효)
② GET  /api/admin/students/schools   → 학교 이름 목록
③ GET  /api/admin/students?school=…  → 학생 목록 (사진 URL 포함)
④ items[].photo_url 을 즉시 GET      → 사진 파일 (1시간 후 만료)
```

②③④는 모두 `Authorization: Bearer <admin_token>` 헤더가 필요하다(④의 사진 URL만 예외 — 헤더 없이 받는다).

---

## 2. 인증

### `POST /api/admin/login`

계정 정보는 별도 채널로 전달받는다.

**요청**

```json
{ "username": "admin", "password": "<비밀번호>" }
```

**응답 `200`**

```json
{ "admin_token": "eyJhbGciOiJIUzI1NiIs..." }
```

**사용**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

| 항목          | 값                                      |
| ------------- | --------------------------------------- |
| 토큰 유효기간 | 12시간                                  |
| 만료 시       | `401` 반환 → 다시 로그인해 새 토큰 발급 |
| 갱신(refresh) | 없음. 재로그인만 지원                   |

```bash
TOKEN=$(curl -s -X POST https://api.cnu-likelion.kr/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<비밀번호>"}' | jq -r .admin_token)
```

---

## 3. 엔드포인트

### 3.1 `GET /api/admin/students/schools` — 학교 목록

가입 학생이 있는 학교 이름을 가나다순으로 반환한다.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.cnu-likelion.kr/api/admin/students/schools
```

```json
["새싹중", "한마당고"]
```

> 학교는 별도 코드나 ID 없이 **이름 문자열**로 식별한다. 아래 `school` 파라미터에는
> 이 응답의 값을 **그대로** 넣어야 한다(공백·표기 하나만 달라도 결과가 0건이 된다).

### 3.2 `GET /api/admin/students` — 학생 목록

**쿼리 파라미터** (모두 선택, 여러 개를 주면 AND 결합)

| 파라미터        | 타입    | 기본값 | 설명                                                                                     |
| --------------- | ------- | ------ | ---------------------------------------------------------------------------------------- |
| `school`        | string  | –      | 학교 이름 정확 일치                                                                       |
| `grade`         | int     | –      | 학년                                                                                      |
| `class_no`      | int     | –      | 반                                                                                        |
| `q`             | string  | –      | 이름 부분 일치 (대소문자 무시)                                                            |
| `limit`         | int     | `50`   | 한 번에 받을 개수                                                                         |
| `offset`        | int     | `0`    | 건너뛸 개수                                                                               |
| `sort`          | enum    | –      | `created_desc` \| `created_asc` \| `name_asc`                                            |
| `include_photo` | boolean | `true` | `false`면 `photo_url`을 서명하지 않고 `null`로 내려준다. 사진이 필요 없으면 응답이 크게 빨라진다(832명 기준 31초 → 0.5초) |

`sort`를 생략하면 **학교 → 학년 → 반 → 번호** 순으로 정렬된다. 반별로 명단을 만들 때 가장 편한 순서다.

```bash
curl -G -H "Authorization: Bearer $TOKEN" \
  https://api.cnu-likelion.kr/api/admin/students \
  --data-urlencode "school=한마당고" \
  -d limit=100 -d offset=0
```

**응답 `200`**

```json
{
  "total": 213,
  "items": [
    {
      "id": "3f2a9c14-1b7e-4a55-9a0d-7c2f5e8b1234",
      "school": "한마당고",
      "grade": 1,
      "class_no": 2,
      "student_no": 1,
      "name": "가은",
      "password": "20110101",
      "gender": "female",
      "photo_url": "https://<bucket>.s3.ap-northeast-2.amazonaws.com/uploads/photos/...?X-Amz-Signature=...",
      "has_photo": true,
      "consent_privacy": true,
      "created_at": "2026-07-31T02:11:04.123456+00:00",
      "progress": {
        "status": "completed",
        "stages_done": ["q1to6", "q7a", "q7b", "q8", "q9"],
        "has_persona": true,
        "has_card": true,
        "last_activity_at": "2026-07-31T03:02:11+00:00"
      }
    }
  ]
}
```

`total`은 **필터 조건에 맞는 전체 개수**이며 `limit`의 영향을 받지 않는다. 페이지네이션의 종료 조건으로 쓴다.

### 3.3 `GET /api/admin/students/{id}` — 학생 상세

설문 답변·페르소나·카드까지 필요할 때만 학생 단위로 호출한다(목록에는 진행 상태만 들어 있다).

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.cnu-likelion.kr/api/admin/students/3f2a9c14-1b7e-4a55-9a0d-7c2f5e8b1234
```

목록 항목과 같은 학생 기본 필드(`progress`, `has_photo` 제외)에 `sessions[]`(최신순)가 붙는다.

```json
{
  "id": "3f2a9c14-...", "school": "한마당고", "grade": 1, "class_no": 2,
  "student_no": 1, "name": "가은", "password": "20110101",
  "gender": "female", "photo_url": "https://...", "consent_privacy": true,
  "created_at": "2026-07-31T02:11:04+00:00",
  "sessions": [
    {
      "id": "9b1d...",
      "status": "completed",
      "created_at": "2026-07-31T02:20:00+00:00",
      "completed_at": "2026-07-31T03:02:11+00:00",
      "answers": [
        { "stage": "q1to6", "payload": { "…단계별 응답…" }, "created_at": "…" }
      ],
      "persona": {
        "name": "숲을 설계하는 조율자",
        "tagline": "자연과 사람 사이의 균형을 맞추는 사람",
        "keywords": ["생태", "설계", "협업"],
        "fields": ["환경공학", "도시계획"]
      },
      "card_image_url": "https://...?X-Amz-Signature=..."
    }
  ]
}
```

`persona`와 `card_image_url`은 아직 생성 전이면 `null`이다. `card_image_url`도 사진과 동일하게 **1시간 만료**되는 URL이다.

### 3.4 그 밖의 엔드포인트

`DELETE /api/admin/students/{id}`와 `POST /api/admin/students/bulk-delete`가 존재하지만
**되돌릴 수 없는 하드 삭제**(DB + 사진/카드 파일 동시 삭제)다. 조회 목적의 연동에서는 호출하지 않는다.

### 3.5 `GET /api/admin/progress/classes` — 반별 진행 현황 집계

학생 개인정보 없이 학교 하나의 (학년, 반)별 카운트만 반환한다. 학생 명단 전체를 받지 않고
진행률만 확인하고 싶을 때 쓴다. `school`은 필수이며, `/api/admin/students/schools` 응답의
값을 그대로 넣는다(3.1과 동일한 정확 일치 규칙).

```bash
curl -G -H "Authorization: Bearer $TOKEN" \
  https://api.cnu-likelion.kr/api/admin/progress/classes \
  --data-urlencode "school=한마당고"
```

**응답 `200`**

```json
[
  { "grade": 1, "class_no": 1, "total": 32, "completed": 18, "in_progress": 5, "not_started": 9 },
  { "grade": 1, "class_no": 2, "total": 30, "completed": 12, "in_progress": 8, "not_started": 10 }
]
```

| 필드          | 타입 | 설명                            |
| ------------- | ---- | ------------------------------- |
| `grade`       | int  | 학년                            |
| `class_no`    | int  | 반                              |
| `total`       | int  | 반 전체 학생 수                |
| `completed`   | int  | 설문 완료 학생 수              |
| `in_progress` | int  | 설문 진행 중인 학생 수         |
| `not_started` | int  | 설문을 시작하지 않은 학생 수   |

`completed + in_progress + not_started == total`이 항상 성립한다. 학교 전체를 학생 목록으로
받으면 초 단위 응답이 걸릴 수 있는 규모에서도, 이 엔드포인트는 카운트만 집계하므로 응답이
훨씬 가볍다(예: 832명 규모 학교에서 31개 반 / 약 2.9 KB / 약 86 ms).

### 3.6 `GET /api/admin/students/{id}/photo-url` — 학생 사진 URL 1건

`GET /api/admin/students`를 `include_photo=false`로 받아 사진을 뺀 뒤, 특정 학생의 사진만
필요한 시점에 호출한다.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.cnu-likelion.kr/api/admin/students/3f2a9c14-1b7e-4a55-9a0d-7c2f5e8b1234/photo-url
```

**응답 `200`**

```json
{ "photo_url": "https://<bucket>.s3.ap-northeast-2.amazonaws.com/uploads/photos/...?X-Amz-Signature=..." }
```

사진이 없는 학생도 `200`에 `photo_url: null`로 응답한다. 학생 자체가 없으면 `404`다.
URL의 유효기간·사용법은 5절과 동일하다(1시간 만료, 인증 불필요).

---

## 4. 데이터 필드 설명

### 학생

| 필드              | 타입           | 설명                                                                  |
| ----------------- | -------------- | ---------------------------------------------------------------------- |
| `id`              | UUID           | 학생 고유 ID. 상세 조회 키                                             |
| `school`          | string         | 학교 이름                                                              |
| `grade`           | int            | 학년                                                                    |
| `class_no`        | int            | 반                                                                      |
| `student_no`      | int            | 번호                                                                    |
| `name`            | string         | 이름                                                                    |
| `password`        | string         | 학생 로그인 비밀번호(평문)                                             |
| `gender`          | string \| null | `"male"` \| `"female"`                                                 |
| `photo_url`       | string \| null | 사진 임시 URL. 없으면 `null`                                           |
| `has_photo`       | bool           | 사진 보유 여부. `include_photo=false`로 받아 `photo_url`이 `null`이어도 유효 |
| `consent_privacy` | bool           | 개인정보 수집 동의 여부                                                |
| `created_at`      | datetime       | 가입 시각 (ISO 8601, UTC)                                              |
| `progress`        | object         | 설문 진행 상태 (아래)                                                  |

### `progress` — 설문 진행 상태

가장 최근 세션 기준이다.

| 필드               | 타입             | 설명                                                                        |
| ------------------ | ---------------- | --------------------------------------------------------------------------- |
| `status`           | enum             | `not_started` (시작 안 함) \| `in_progress` (진행 중) \| `completed` (완료) |
| `stages_done`      | string[]         | 저장된 단계: `q1to6`, `q7a`, `q7b`, `q8`, `q9`                              |
| `has_persona`      | bool             | 페르소나 생성 완료 여부                                                     |
| `has_card`         | bool             | 카드 발급 완료 여부                                                         |
| `last_activity_at` | datetime \| null | 마지막 활동 시각                                                            |

> 예: 카드까지 받은 학생만 뽑으려면 `progress.has_card === true`로 거르면 된다.
> (서버 측 필터 파라미터는 없으므로 **받아온 뒤 클라이언트에서 거른다.**)

---

## 5. 사진 다루기

`photo_url`은 S3 **presigned URL**이다.

| 항목     | 내용                                     |
| -------- | ---------------------------------------- |
| 유효기간 | **발급 후 1시간**                        |
| 인증     | 불필요. URL 그대로 `GET`                 |
| 형식     | 업로드 원본 이미지 (일반적으로 JPEG)     |
| 없을 때  | `null` (사진 미등록 또는 서명 생성 실패) |

```bash
curl -o 가은.jpg "https://<bucket>.s3.../uploads/photos/...?X-Amz-Signature=..."
```

**규칙 3가지**

1. **목록을 받은 직후 내려받는다.** 만료된 URL은 `403`을 반환한다.
2. **URL을 DB에 저장하지 않는다.** 나중에 쓸 수 없다. 파일을 저장하고 로컬 경로를 기록한다.
3. **`null` 체크는 필수다.** 사진이 없는 학생이 정상적으로 존재한다.

---

## 6. 페이지네이션

`limit` + `offset`을 조합하고, `total`에 도달할 때까지 반복한다.

```
1회차  limit=100&offset=0    → total=213, items 100개
2회차  limit=100&offset=100  → items 100개
3회차  limit=100&offset=200  → items 13개
       offset(300) >= total(213) → 종료
```

- `limit` 기본값은 `50`이다. **생략하면 50개까지만 온다.**
- 권장 `limit`은 `100~200`. 큰 값을 넣으면 학생 수만큼 사진 URL을 생성하느라 응답이 느려진다.
- 수집 중 새 학생이 가입하면 순서가 밀릴 수 있다. 정확성이 중요하면 `sort=created_asc`로 고정한다.

---

## 7. 자주 쓰는 조회 예

| 목적                 | 쿼리                                                       |
| -------------------- | ---------------------------------------------------------- |
| 전체 학교, 전체 학생 | `?limit=100&offset=0`                                      |
| 한 학교 전체         | `?school=한마당고&limit=100`                               |
| 한 학교의 1학년      | `?school=한마당고&grade=1`                                 |
| 1학년 2반 명단       | `?school=한마당고&grade=1&class_no=2`                      |
| 반 명단을 번호순으로 | `?school=한마당고&grade=1&class_no=2` (기본 정렬이 번호순) |
| 이름으로 검색        | `?q=가은`                                                  |
| 이름 가나다순        | `?school=한마당고&sort=name_asc`                           |
| 최근 가입 순         | `?sort=created_desc&limit=20`                              |

---

## 8. 전체 수집 예제

### Python

```python
import httpx, pathlib, json

BASE = "https://api.cnu-likelion.kr"
OUT = pathlib.Path("./export")

client = httpx.Client(base_url=BASE, timeout=30)
token = client.post("/api/admin/login",
                    json={"username": "admin", "password": "<비밀번호>"}
                    ).json()["admin_token"]
H = {"Authorization": f"Bearer {token}"}

rows = []
for school in client.get("/api/admin/students/schools", headers=H).json():
    offset = 0
    while True:
        body = client.get("/api/admin/students", headers=H,
                          params={"school": school, "limit": 100, "offset": offset}).json()
        for s in body["items"]:
            if s["photo_url"]:                      # 만료 전에 즉시 저장
                dest = OUT / "photos" / school / f"{s['grade']}-{s['class_no']}"
                dest.mkdir(parents=True, exist_ok=True)
                path = dest / f"{s['student_no']:02d}_{s['name']}.jpg"
                path.write_bytes(httpx.get(s["photo_url"], timeout=60).content)
                s["photo_file"] = str(path.relative_to(OUT))
            s.pop("photo_url", None)                # 만료되는 URL은 보관하지 않는다
            rows.append(s)
        offset += 100
        if offset >= body["total"]:
            break

(OUT / "students.json").write_text(
    json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"학생 {len(rows)}명 수집 완료")
```

### JavaScript (Node 18+)

```js
const BASE = "https://api.cnu-likelion.kr";

const { admin_token } = await (
  await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "<비밀번호>" }),
  })
).json();

const H = { Authorization: `Bearer ${admin_token}` };
const schools = await (
  await fetch(`${BASE}/api/admin/students/schools`, { headers: H })
).json();

for (const school of schools) {
  let offset = 0,
    total = Infinity;
  while (offset < total) {
    const url = `${BASE}/api/admin/students?school=${encodeURIComponent(school)}&limit=100&offset=${offset}`;
    const body = await (await fetch(url, { headers: H })).json();
    total = body.total;
    for (const s of body.items) {
      if (!s.photo_url) continue;
      const buf = Buffer.from(await (await fetch(s.photo_url)).arrayBuffer());
      // buf 저장…
    }
    offset += 100;
  }
}
```

### 준비된 스크립트 (저장소 내부)

`backend/scripts/export_students.py`가 위 과정을 그대로 수행한다.

```bash
uv run python -m scripts.export_students \
    --base-url https://api.cnu-likelion.kr \
    --username admin --password '<비밀번호>' --out ./export
```

| 옵션                | 설명                                |
| ------------------- | ----------------------------------- |
| `--school 한마당고` | 특정 학교만 (생략 시 전체)          |
| `--page-size 100`   | 페이지당 개수                       |
| `--no-photos`       | 사진 없이 명단만                    |
| `--detail`          | 학생별 상세(답변·페르소나)까지 수집 |

```
export/
├─ students.json                      # 수집 명단 (photo_url → photo_file 경로로 치환)
└─ photos/한마당고/1-2/01_가은.jpg      # 학교/학년-반/번호_이름
```

---

## 9. 에러

도메인 에러는 아래 형식으로 통일되어 있다.

```json
{
  "error": {
    "code": "unauthorized",
    "message": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "details": {}
  }
}
```

| 상태  | code           | 원인                                           | 대응                                                  |
| ----- | -------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `401` | `unauthorized` | 토큰 없음·만료·잘못된 종류의 토큰, 로그인 실패 | 재로그인 후 재시도                                    |
| `404` | `not_found`    | 없는 학생 ID                                   | ID 확인                                               |
| `422` | –              | 파라미터 타입 오류(`grade=일학년` 등)          | 파라미터 점검. 형식은 FastAPI 기본(`{"detail": […]}`) |
| `403` | –              | **사진 URL 만료**                              | 목록부터 다시 조회해 새 URL 획득                      |

---

## 10. 연동 시 주의

- **CORS는 전 오리진 허용이다.** 브라우저 프런트에서 직접 호출해도 되고, 서버 사이드에서 호출해도 된다.
- **응답에는 학생 실명·평문 비밀번호·얼굴 사진이 포함된다.** 관리자 토큰 하나가 전체 학생 개인정보 열람권과
  같다. 토큰과 계정 정보를 코드·저장소·로그에 남기지 말고 환경변수로 주입한다.
- 수집한 데이터의 보관 위치와 접근 권한을 사전에 정한다.
- 조회 전용으로 쓰고, 삭제 계열 엔드포인트는 호출하지 않는다.
- 대량 수집은 학생 수에 비례해 사진 URL 생성 비용이 든다. 야간 등 트래픽이 적은 시간대를 권한다.
- 사진이 당장 필요 없다면 `include_photo=false`로 이 비용 자체를 건너뛸 수 있다(3.2절 참고).

---

## 부록. 엔드포인트 요약

| 메서드 | 경로                                  | 인증 | 설명                                     |
| ------ | ------------------------------------- | ---- | ---------------------------------------- |
| POST   | `/api/admin/login`                    | –    | 토큰 발급                                |
| GET    | `/api/admin/students/schools`         | 필요 | 학교 이름 목록                           |
| GET    | `/api/admin/students`                 | 필요 | 학생 목록 (필터·정렬·페이지네이션)       |
| GET    | `/api/admin/students/{id}`            | 필요 | 학생 상세 (답변·페르소나·카드)           |
| GET    | `/api/admin/progress/classes`         | 필요 | 학교의 반별 진행 현황 집계 (개인정보 없음) |
| GET    | `/api/admin/students/{id}/photo-url`  | 필요 | 학생 사진 URL 1건                        |
| DELETE | `/api/admin/students/{id}`            | 필요 | 하드 삭제 — 연동에서 사용 금지           |
| POST   | `/api/admin/students/bulk-delete`     | 필요 | 일괄 하드 삭제 — 연동에서 사용 금지      |
| GET    | `/healthz`                            | –    | 헬스체크                                 |

미구현 상태인 엔드포인트: `/api/admin/dashboard`, `/api/admin/stats/keywords`, `/api/admin/operators`.

## 변경 이력

| 날짜       | 내용                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-31 | 최초 작성 (외부 전달용). 관련 내부 문서: [`2026-07-31-external-admin-api-guide.md`](2026-07-31-external-admin-api-guide.md) |
| 2026-08-01 | `include_photo` 파라미터와 `has_photo` 필드 추가, 반별 집계·사진 단건 엔드포인트 추가. 기존 동작·기본값은 그대로 |
