# 학생 데이터 내보내기 API (v1)

학생 정보 · 설문 데이터 · 원본 사진 · AI 생성 인물 이미지를 조회하는 API.

- Base URL: `https://api.cnu-likelion.kr`
- 인증: `Authorization: Bearer <EXPORT_API_KEY>` (별도 전달). 없거나 틀리면 `401`

## 엔드포인트

### `GET /api/export/v1/students` — 목록

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `limit` | `200` | 1~500 |
| `cursor` | – | 이전 응답의 `next_cursor`. `null`이 올 때까지 반복 |

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
      "created_at": "2026-09-08T05:54:37Z",
      "photo_url": "https://...",
      "survey": {
        "session_id": "9b1d...",
        "status": "completed",
        "started_at": "2026-09-08T06:00:00Z",
        "completed_at": "2026-09-08T06:20:11Z",
        "riasec": { "A": 1, "C": 7, "E": 1, "I": 2, "R": 0, "S": 5 },
        "pair_code": "CS",
        "answers": [
          { "no": "Q1", "question": "[선착장 도착] 가장 먼저 시작하는 일은?", "answer": "지도와 주변 풍경을 비교해 지금 위치를 짐작한다." },
          { "no": "Q7-A", "description": "오늘 밤 다시 가보고 싶은 캠프 공간 1·2순위", "answer": ["쉼터 — …", "모임방 — …"] }
        ]
      },
      "persona": {
        "name": "하늘길을 설계하는 드론 전문가",
        "headline": "하늘길을 설계하는",
        "base_career": "드론 전문가",
        "tagline": "…",
        "competencies": ["공간 지각", "문제 해결", "협업"],
        "image_url": "https://...",
        "approved_at": "2026-10-07T03:00:00Z"
      }
    }
  ],
  "next_cursor": "f8a1..."
}
```

### `GET /api/export/v1/students/{id}` — 1명

목록 `items[]`의 한 항목과 같은 객체. 없으면 `404`.

## 필드

| 필드 | 설명 |
|---|---|
| `kind` | `student`(학교 소속) \| `guest`(개인 참여자) |
| `school` · `grade` · `class_no` · `student_no` | 개인 참여자는 `""` · `0` · `0` · `0` |
| `gender` | `male` \| `female` |
| `birth_date` | `YYYYMMDD` \| `null` |
| `photo_url` | 원본 사진. 없으면 `null` |
| `survey` | 완료한 설문 중 최신(없으면 최근 설문). 설문 전이면 `null` |
| `survey.status` | `completed` \| `in_progress` \| `abandoned` |
| `survey.riasec` · `pair_code` | Q1~Q6 완료 전이면 `null` |
| `survey.answers` | Q1~Q6은 `question` + `answer`(문자열), Q7-A~Q9는 `description` + `answer`(배열) |
| `persona` | 검수 승인된 결과. 승인 전이면 `null` |
| `persona.image_url` | AI 생성 인물 이미지. 생성 실패 시 `null` |

## 이미지

- `photo_url`·`persona.image_url`은 **1시간 후 만료**된다. 받은 즉시 내려받는다(인증 헤더 없이 GET).
- 이미지는 거의 바뀌지 않는다. 원본 사진은 `id`당 한 번, 생성 이미지는 `persona.approved_at`이 바뀔 때만 다시 받는다.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-07 | 최초 작성 |
