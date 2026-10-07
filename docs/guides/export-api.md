# 학생 데이터 내보내기 API (v1)

외부 시스템에 **학생 정보 · 설문 데이터 · 원본 사진 · AI 생성 인물 이미지**를 넘기는 조회 전용 API.
이 문서 하나로 연동이 끝나도록 구성했다(외부 전달용).

- Base URL: `https://api.cnu-likelion.kr`
- 인증: 조회 전용 키 — `Authorization: Bearer <EXPORT_API_KEY>`
- 응답 형식: JSON (UTF-8)
- 대화형 스펙: `https://api.cnu-likelion.kr/docs` (Swagger UI, `export` 태그)

---

## 1. 3분 요약

```
① GET /api/export/v1/students?limit=500                 → items[] + next_cursor
② GET /api/export/v1/students?limit=500&cursor=<next>   → 반복
③ next_cursor가 null이면 끝
⑤ GET /api/export/v1/students/{id}                    → 학생 1명 (목록 한 항목과 같은 모양)
④ items[].photo_url · persona.image_url 은 받은 즉시 GET → 이미지 파일 (1시간 후 만료)
```

5,175명 기준 500개씩 11번 호출, 3~4초면 전체를 받는다.

---

## 2. 인증

키는 별도 채널로 전달받는다. 모든 요청에 헤더로 붙인다.

```bash
curl -H "Authorization: Bearer $EXPORT_API_KEY" \
  "https://api.cnu-likelion.kr/api/export/v1/students?limit=500"
```

| 상황 | 응답 |
|---|---|
| 키 없음 · 틀림 | `401` |
| 서버에서 키를 비활성화(교체·회수) | `401` — 새 키를 받아야 한다 |

이 키로는 조회만 된다. 관리자 API(`/api/admin/*`)에는 쓸 수 없다.

---

## 3. 엔드포인트

### 3.1 `GET /api/export/v1/students` — 학생 목록

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `limit` | int | `200` | 한 번에 받을 학생 수 (1~500) |
| `cursor` | UUID | – | 이전 응답의 `next_cursor`. 첫 호출엔 생략 |

- 정렬은 학생 `id` 순으로 고정이다. 호출 사이에 학생이 추가돼도 누락·중복 없이 이어진다.
- 대상: 학교 소속 학생(`kind="student"`)과 개인 참여자(`kind="guest"`). 테스트 계정과 삭제된 학생은 나오지 않는다.

**응답 `200`**

```json
{
  "items": [
    {
      "id": "f751a588-d2da-4ae1-8962-41fd14c6a95a",
      "kind": "student",
      "school": "대전대청중학교",
      "grade": 3,
      "class_no": 6,
      "student_no": 15,
      "name": "서민준",
      "gender": "male",
      "birth_date": null,
      "consent_privacy": true,
      "created_at": "2026-09-08T05:54:37.776812Z",
      "photo_url": "https://...?X-Amz-Signature=...",
      "survey": {
        "session_id": "9b1d...",
        "status": "completed",
        "started_at": "2026-09-08T06:00:00Z",
        "completed_at": "2026-09-08T06:20:11Z",
        "riasec": { "A": 1, "C": 7, "E": 1, "I": 2, "R": 0, "S": 5 },
        "pair_code": "CS",
        "answers": [
          { "no": "Q1", "question": "[선착장 도착] 가장 먼저 시작하는 일은?", "answer": "지도와 주변 풍경을 비교해 지금 위치를 짐작한다." },
          "… Q2 ~ Q6 …",
          { "no": "Q7-A", "description": "오늘 밤 다시 가보고 싶은 캠프 공간 1·2순위 …", "answer": ["쉼터 — …", "모임방 — …"] },
          "… Q7-B, Q8, Q9 …"
        ]
      },
      "persona": {
        "name": "하늘길을 설계하는 드론 전문가",
        "headline": "하늘길을 설계하는",
        "base_career": "드론 전문가",
        "tagline": "…",
        "competencies": ["공간 지각", "문제 해결", "협업"],
        "image_url": "https://...?X-Amz-Signature=...",
        "approved_at": "2026-10-07T03:00:00Z"
      }
    }
  ],
  "next_cursor": "f8a1..."
}
```

### 3.2 `GET /api/export/v1/students/{id}` — 학생 1명

목록에서 받아 둔 학생 `id`(UUID)로 한 명만 다시 조회한다. 이미지 URL이 만료됐거나,
승인 후 `persona`가 채워졌는지 확인할 때 쓴다.

```bash
curl -H "Authorization: Bearer $EXPORT_API_KEY" \
  https://api.cnu-likelion.kr/api/export/v1/students/18086685-fc16-48bf-a54e-ca6ba461ddd7
```

- 응답 `200`: 목록 `items[]`의 한 항목과 **같은 모양**의 객체 하나(배열·`next_cursor` 없음)
- 없거나 삭제된 학생 → `404`
- 잘못된 UUID 형식 → `422`

---

## 4. 필드 설명

### 학생

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | 학생 고유 ID. 동기화 키로 쓴다 |
| `kind` | string | `student`(학교 소속) \| `guest`(개인 참여자) |
| `school` · `grade` · `class_no` · `student_no` | string · int | 개인 참여자는 `""` · `0` · `0` · `0` (실제 반·번호 아님) |
| `name` | string | 이름 |
| `gender` | string | `male` \| `female`. 항상 있다 |
| `birth_date` | string \| null | `YYYYMMDD`. 개인 참여자만 필수라 학교 소속은 대개 `null` |
| `consent_privacy` | bool | 개인정보 수집 동의 여부 |
| `created_at` | datetime | 가입 시각 (ISO 8601, UTC) |
| `photo_url` | string \| null | **원본 사진** 임시 URL (1시간 만료). 사진이 없으면 `null` |

로그인 비밀번호는 내보내지 않는다.

### `survey` — 설문 데이터

학생당 세션 하나만 담는다. **완료한 세션 중 가장 최근 것**, 완료한 세션이 없으면 가장 최근 세션이다.
설문을 시작하지 않았으면 `survey`가 `null`이다.

| 필드 | 설명 |
|---|---|
| `status` | `completed` \| `in_progress` \| `abandoned` |
| `riasec` · `pair_code` | Q1~Q6을 마치기 전이면 `null` |
| `answers` | 문항 순서(Q1~Q6, Q7-A, Q7-B, Q8, Q9). 답하지 않은 문항은 빠진다 |

- Q1~Q6: `question`(`[장면] 질문`)과 고른 선택지 문구 `answer`(문자열)
- Q7-A~Q9: 선택지를 AI가 학생마다 만들어 고정 질문이 없으므로 `description`(문항 설명)과
  `answer`(문자열 배열). Q7은 `[1순위, 2순위]`, Q8·Q9는 고른 표현 뒤에 직접 입력한 문장

### `persona` — 페르소나 결과

**검수에서 승인된 확정본만** 담는다. 승인 전이거나 설문을 다시 해 확정본이 최신 세션과 맞지 않으면 `null`이다.
승인이 진행되면 다음 동기화부터 채워진다.

| 필드 | 설명 |
|---|---|
| `name` | 페르소나 이름 전체 (`headline` + `base_career`) |
| `headline` · `base_career` | 수식어 · 직업명 |
| `tagline` | 한 줄 설명 |
| `competencies` | 필요 역량 3개 |
| `image_url` | **AI 생성 인물 이미지** 임시 URL (1시간 만료). 생성에 실패해 기본 캐릭터를 쓴 학생은 `null` |
| `approved_at` | 확정 시각 |

---

## 5. 이미지 받기

`photo_url`과 `persona.image_url`은 **발급 후 1시간이 지나면 만료되는** 서명 URL이다.

- 목록을 받은 직후 내려받아 저장한다. URL 자체를 저장해 두면 나중에 열리지 않는다.
- 만료됐으면 목록을 다시 호출해 새 URL을 받는다.
- 요청에 인증 헤더를 붙이지 않는다(서명이 URL에 들어 있다).

---

## 6. 동기화 권장 방식

변경분만 받는 기능은 없다. **매번 전체를 받아 `id` 기준으로 덮어쓴다.** 5천 명 기준 수 초면 끝난다.

```python
import httpx

BASE = "https://api.cnu-likelion.kr/api/export/v1/students"
headers = {"Authorization": f"Bearer {EXPORT_API_KEY}"}

cursor = None
while True:
    params = {"limit": 500, **({"cursor": cursor} if cursor else {})}
    page = httpx.get(BASE, params=params, headers=headers, timeout=60).json()
    for s in page["items"]:
        save(s)  # id 기준 upsert, photo_url·persona.image_url은 즉시 내려받기
    cursor = page["next_cursor"]
    if cursor is None:
        break
```

이미지는 거의 바뀌지 않는다. **동기화할 때마다 전부 다시 받으면 전송 비용이 쌓이므로**,
원본 사진은 학생 `id`당 한 번만, AI 생성 이미지는 `persona.approved_at`이 바뀌었을 때만 받는다.
(전체 1회 ≈ 원본 사진 3.5GB + 생성 이미지 최대 10GB)

---

## 7. 다운로드 스크립트

위 과정을 그대로 구현한 Python 스크립트 `download_export.py`를 함께 전달한다. 필요한 패키지는 `httpx` 하나.

```bash
pip install httpx
export EXPORT_API_KEY=<전달받은 키>

python download_export.py --out ./export                 # 전체
python download_export.py --out ./export --student-id <UUID>   # 1명
python download_export.py --out ./export --no-images     # 이미지 없이 데이터만
```

| 출력 | 내용 |
|---|---|
| `export/students.json` | 전체 데이터. 만료되는 URL 대신 로컬 경로 `photo_file`, `persona.image_file`이 들어간다 |
| `export/photos/<id>.<확장자>` | 원본 사진 |
| `export/persona/<id>_<승인시각>.<확장자>` | AI 생성 인물 이미지 |

- 같은 `--out`으로 다시 실행하면 이미 받은 이미지는 건너뛴다(위 비용 안내대로 동작).
- 이미지 다운로드가 실패하면 종료 코드 `1`로 끝나고, 다음 실행 때 실패한 것만 다시 받는다.
- 원본: 저장소 `backend/scripts/download_export.py`

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-07 | 최초 작성. `GET /api/export/v1/students` — 조회 전용 키, 커서 페이지네이션, 학생 단건 조회, 다운로드 스크립트, 학생 정보·대표 설문·원본 사진·승인된 페르소나와 AI 생성 이미지 |
