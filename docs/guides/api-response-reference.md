# 전체 API 응답 구조

현재 로컬 서버의 OpenAPI와 라우터·서비스 코드를 대조한 문서입니다. 실제 개인 데이터·토큰은 조회하지 않았습니다.

- 서버: `http://localhost:8000`
- Swagger: http://localhost:8000/docs
- JSON 명세: http://localhost:8000/openapi.json
- 정상 응답은 공통 `data`/`success` 포장 없이 객체 또는 배열을 직접 반환합니다.
- 아래 JSON은 형태 설명용 예시이며 실제 요청 결과가 아닙니다. 선택/nullable 필드는 상황에 따라 null 또는 빈 배열이 될 수 있습니다.
- 모델 표의 “기본값 있음”은 요청에서 생략 가능한 모델 필드라는 의미입니다. 응답은 현재 직렬화 설정상 기본값/null 필드도 포함합니다.

## API 목록

| 메서드 | 경로 | 인증 | 정상 코드 | 응답 | 설명 |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | 없음 | 200 | `RegisterResponse` | 학생 등록 → 학생 세션 토큰 발급. |
| POST | `/api/auth/login` | 없음 | 200 | `LoginResponse` | 식별 키(학교 소속) 또는 이름(개인 참여자) + 비밀번호 인증 → 학생 세션 토큰 발급. |
| POST | `/api/auth/refresh` | 학생 | 200 | `LoginResponse` | 유효한 학생 토큰을 새 만료시간으로 재발급. |
| POST | `/api/sessions/restart` | 학생 | 200 | `SaveAnswerResponse` | 확인 팝업에 동의한 로그인 학생 자신의 이전 완료 결과를 삭제한다. |
| POST | `/api/sessions/answers` | 학생 | 200 | `SaveAnswerResponse` | 설문 단계별 답변 저장(q1to6, q7a, q7b, q8, q9). |
| POST | `/api/sessions/complete` | 학생 | 200 | `ProfileSummary` | 세션을 completed로 승격하고 프로필 요약을 반환한다. |
| GET | `/api/sessions/{session_id}/next-question` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 다음 질문 반환. 적응형/최종 질문은 AI 호출(동기) 후 응답. |
| POST | `/api/cards/generate` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 페르소나 + 이미지 생성 잡을 큐에 등록. job_id 반환. |
| GET | `/api/cards/jobs/{job_id}` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 잡 상태 폴링용. |
| GET | `/api/cards/{card_id}` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 카드 상세. 본인 토큰 또는 share token으로 접근. |
| POST | `/api/cards/{card_id}/share-links` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 단기 공유 토큰 발급 (부모/친구용). |
| POST | `/api/students/me/photo` | 학생 | 200 | `PhotoUploadResponse` | 촬영/선택한 사진을 업로드해 본인 계정에 연결. |
| GET | `/api/students/me` | 학생 | 200 | `ProfileSummary` | 본인 프로필 상태 — 설문 완료 여부, 페르소나·카드, 다시 하기 스위치. |
| DELETE | `/api/students/me` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 학생 데이터 삭제 요청 (soft delete + 사진/이미지 폐기). |
| PATCH | `/api/students/me` | 학생 | 200 | `ProfileSummary` | 본인 이름/성별 수정. 로그인 식별 키(학교/학년/반/번호)·비밀번호는 이 API로 못 바꾼다. |
| POST | `/api/operator/login` | 없음 | 200 | `OperatorLoginResponse` | 운영진 공유 비밀번호 로그인 → 운영자 세션 토큰 발급. |
| POST | `/api/operator/scan` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 카드 QR(공유 토큰) 검증 + 닉네임·페르소나 타이틀 반환. |
| POST | `/api/operator/rewards` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 리워드 적립. 자기 부스에 대해서만 허용. reward_logs INSERT. |
| POST | `/api/admin/login` | 없음 | 200 | `AdminLoginResponse` | 관리자 단일 계정 로그인 → admin 세션 토큰 발급. |
| GET | `/api/admin/students` | 관리자/운영진 | 200 | `AdminStudentList` | 가입한 참가자 목록 — 검색/필터/정렬/페이지네이션, 사진 presigned URL 포함. |
| GET | `/api/admin/students/schools` | 관리자/운영진 | 200 | `string[]` | 학교 필터 드롭다운용 — 가입 학생이 있는 학교 이름 목록(가나다순). |
| POST | `/api/admin/students/bulk-delete` | 관리자 | 200 | `AdminBulkDeleteResponse` | 여러 학생을 한 번에 하드 삭제(DB cascade + S3 사진/카드 이미지). |
| POST | `/api/admin/students/test` | 관리자 | 201 | `AdminTestStudent` | 테스트 계정 발급 — 관리자 화면에서만 만들 수 있고 학생 로그인 화면엔 노출되지 않는다. |
| DELETE | `/api/admin/students/test` | 관리자 | 200 | `AdminTestPurgeResponse` | 테스트 계정 전부 삭제 — DB cascade + S3 사진/카드 이미지. |
| POST | `/api/admin/students/test/{student_id}/token` | 관리자 | 200 | `AdminTestToken` | 테스트 계정으로 학생 화면에 진입할 학생 세션 토큰 발급. |
| GET | `/api/admin/progress/classes` | 관리자/운영진 | 200 | `AdminClassProgress[]` | 학교의 반별 진행 현황 집계 — 좌석표의 학년·반 선택과 완료 배지용. |
| GET | `/api/admin/students/{student_id}` | 관리자/운영진 | 200 | `AdminStudentDetail` | 학생 1명 상세 — 설문 진행 단계별 답변·페르소나·카드 결과. |
| DELETE | `/api/admin/students/{student_id}` | 관리자 | 200 | `AdminDeleteResponse` | 학생 하드 삭제 — DB(세션·답변·페르소나·카드 cascade) + S3 사진/카드 이미지. |
| GET | `/api/admin/students/{student_id}/photo-url` | 관리자/운영진 | 200 | `AdminStudentPhoto` | 학생 사진 presigned URL 1건 — 목록에서 사진을 뺀 화면이 필요할 때만 호출한다. |
| GET | `/api/admin/dashboard` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 실시간 발급 수, 부스별 체험 현황 등. |
| GET | `/api/admin/stats/keywords` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError | 인기 키워드 통계. |
| GET | `/api/admin/operators` | 없음 | 500 (현재 구현 기준) | 미구현: NotImplementedError |  |
| GET | `/api/admin/booths` | 관리자/운영진 | 200 | `BoothResponse[]` | 전체 부스 목록(등록 순). 부스는 수십 개 규모라 페이지네이션을 두지 않는다. |
| POST | `/api/admin/booths` | 관리자 | 201 | `BoothResponse` | 부스 생성 — 6자 code를 자동 발급하고 QR 링크까지 만들어 반환한다. |
| GET | `/api/admin/booths/stats` | 관리자/운영진 | 200 | `BoothStatsResponse` | 부스별 참여인원. 이 라우터의 /{booth_id}는 PATCH·DELETE뿐이라 경로 충돌이 없다. |
| PATCH | `/api/admin/booths/{booth_id}` | 관리자 | 200 | `BoothResponse` | 이름·설명 수정. code는 요청 스키마에 없어 변경할 수 없다. |
| DELETE | `/api/admin/booths/{booth_id}` | 관리자 | 200 | `BoothDeleteResponse` | 부스 삭제. 인쇄된 QR은 이후 무효가 된다. |
| GET | `/api/booths/{code}` | 학생 | 200 | `StudentBoothResponse` | QR로 들어온 부스 정보 + 이 학생의 방문 여부. 카드 발급 전이면 403. |
| POST | `/api/booths/{code}/visit` | 학생 | 200 | `BoothVisitResponse` | 방문 기록. 같은 부스를 다시 찍어도 에러가 아니라 already_visited=true로 200. |
| POST | `/api/generate/{stage}` | 학생 | 200 | stage별 AI JSON (아래 별도 설명) | stage에 맞는 질문 후보를 AI로 생성해 raw JSON dict를 반환한다. |
| GET | `/api/dev/prompts` | 없음 | 200 | `DefaultPromptsResponse` | 화면의 프롬프트 편집기 초깃값. |
| GET | `/api/dev/students` | 없음 | 200 | `DevStudentList` | 학생 선택 목록. 페르소나·사진 생성 가능 여부와 원본 사진 URL을 함께 내린다. |
| GET | `/api/dev/students/{student_id}/answers` | 없음 | 200 | `StudentAnswersResponse` | 학생의 최근 세션 답변을 프롬프트 슬롯 형태로 반환. |
| POST | `/api/dev/persona` | 없음 | 200 | `GeneratePersonaResponse` | 저장된 답변 + 편집한 시스템 프롬프트 → Career Persona 1개 (codex, 이미지 없음). |
| POST | `/api/dev/future-photo` | 없음 | 200 | `GenerateFuturePhotoResponse` | 학생의 저장된 사진 + 편집한 프롬프트 → 10년 뒤 사진 (codex). |
| GET | `/api/dev/drafts` | 없음 | 200 | `DraftList` | 페르소나·카드 초안 목록(`?status=pending\|approved\|rejected`)과 상태별 개수. |
| PATCH | `/api/dev/drafts/{draft_id}` | 없음 | 200 | `DraftItem` | 카드 문구(headline·base_career·name·tagline·note) 수정. |
| POST | `/api/dev/drafts/{draft_id}/regenerate-text` | 없음 | 200 | `DraftItem` | 페르소나 텍스트만 재생성 (codex). 검수 대기로 돌아간다. |
| POST | `/api/dev/drafts/{draft_id}/regenerate-image` | 없음 | 200 | `DraftItem` | 인물 이미지만 재생성 (codex). 실패 시 `error`에 사유. |
| POST | `/api/dev/drafts/{draft_id}/use-fallback` | 없음 | 200 | `DraftItem` | 생성 이미지를 해제하고 폴백 캐릭터로 카드를 만든다. |
| GET | `/api/dev/drafts/{draft_id}/card` | 없음 | 200 | `CardPreview` | 현재 문구·이미지(없으면 폴백 캐릭터)로 합성한 카드 PNG(base64). 저장 안 함. |
| POST | `/api/dev/drafts/{draft_id}/approve` | 없음 | 200 | `DraftItem` | 카드 PNG 합성 → S3 `cards/` → `generated.personas`·`cards` 확정. |
| POST | `/api/dev/drafts/{draft_id}/reject` | 없음 | 200 | `DraftItem` | 반려. 일괄 생성이 다시 만들지 않는다. |
| GET | `/api/dev/schools` | 없음 | 200 | `string[]` | 일괄 생성용 학교 목록. |
| GET | `/api/dev/schools/classes` | 없음 | 200 | `DevClass[]` | 학교(`?school=`)의 학년·반별 학생 수·설문 완료 수·일괄 생성 대상 수(`targets`). |
| GET | `/api/dev/drafts/batch` | 없음 | 200 | `BatchStatus` | 일괄 생성 진행률(메모리 보관 — 서버 재시작 시 초기화). |
| POST | `/api/dev/drafts/batch` | 없음 | 202 | `BatchStatus` | `{classes: [{school, grade, class_no}], concurrency}` 선택한 반들의 대상 전원 초안 생성을 백그라운드로 시작. 진행 중이면 409. |
| POST | `/api/dev/drafts/batch/cancel` | 없음 | 200 | `BatchStatus` | 일괄 생성 중단(진행 중인 codex 프로세스까지 종료). 저장된 초안은 남는다. |
| GET | `/healthz` | 없음 | 200 | `{"status":"ok"}` | 서버 상태 확인 |

총 59개: 구현 48개, 미구현 11개. `/api/dev/*` 18개는 `APP_ENV=local`에서만 등록됩니다.

미구현 API는 OpenAPI에 200과 일반 object로 표시되더라도 실제 정상 응답 계약이 없습니다. 유효한 경로 인자로 핸들러까지 도달하면 미처리 예외로 500이 발생합니다.

관리자/운영진 공통 조회 중 학생 상세는 운영진에게 설문 답변 원문을 제외합니다. 관리자 학생 목록·상세 모델에는 `password` 필드도 포함되어 있습니다.

## 응답 모델별 필드와 JSON 예시

### AdminAnswer

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `stage` | string | 없음 |  |
| `payload` | object | 없음 |  |
| `created_at` | string (date-time) | 없음 |  |

```json
{
  "stage": "<string>",
  "payload": {},
  "created_at": "2026-09-21T10:00:00Z"
}
```

### AdminBulkDeleteResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `deleted` | string (uuid)[] | 없음 |  |
| `not_found` | string (uuid)[] | 없음 |  |
| `removed_storage_objects` | integer | 있음 |  |

```json
{
  "deleted": [
    "00000000-0000-4000-8000-000000000001"
  ],
  "not_found": [
    "00000000-0000-4000-8000-000000000001"
  ],
  "removed_storage_objects": 0
}
```

### AdminClassProgress

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `grade` | integer | 없음 |  |
| `class_no` | integer | 없음 |  |
| `total` | integer | 없음 |  |
| `completed` | integer | 없음 |  |
| `in_progress` | integer | 없음 |  |
| `not_started` | integer | 없음 |  |

```json
{
  "grade": 0,
  "class_no": 0,
  "total": 0,
  "completed": 0,
  "in_progress": 0,
  "not_started": 0
}
```

### AdminDeleteResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `student_id` | string (uuid) | 없음 |  |
| `removed_storage_objects` | integer | 있음 | S3에서 실제로 삭제된 객체 수(사진 + 카드 이미지) |

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "removed_storage_objects": 0
}
```

### AdminLoginResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `admin_token` | string | 없음 | 관리자 세션 JWT (Bearer) |

```json
{
  "admin_token": "<token>"
}
```

### AdminSessionDetail

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `status` | string | 없음 |  |
| `created_at` | string (date-time) | 없음 |  |
| `completed_at` | string (date-time) 또는 null | 없음 |  |
| `answers` | AdminAnswer[] | 없음 |  |
| `persona` | PersonaSummary 또는 null | 있음 |  |
| `card_image_url` | string 또는 null | 있음 | 카드 이미지 presigned URL (없으면 null) |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "<string>",
  "created_at": "2026-09-21T10:00:00Z",
  "completed_at": "2026-09-21T10:00:00Z",
  "answers": [
    {
      "stage": "<string>",
      "payload": {},
      "created_at": "2026-09-21T10:00:00Z"
    }
  ],
  "persona": {
    "name": "<string>",
    "tagline": "<string>",
    "keywords": [
      "<string>"
    ],
    "fields": [
      "<string>"
    ]
  },
  "card_image_url": "https://example.invalid/image"
}
```

### AdminStudentDetail

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `school` | string | 없음 |  |
| `grade` | integer | 없음 |  |
| `class_no` | integer | 없음 |  |
| `student_no` | integer | 없음 |  |
| `name` | string | 없음 |  |
| `password` | string | 없음 | 평문 비밀번호 — 관리자 전용 노출 |
| `gender` | string 또는 null | 있음 | 성별 ('male' \| 'female', 없으면 null) |
| `photo_url` | string 또는 null | 있음 |  |
| `consent_privacy` | boolean | 없음 |  |
| `created_at` | string (date-time) | 없음 |  |
| `sessions` | AdminSessionDetail[] | 있음 |  |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "school": "<string>",
  "grade": 0,
  "class_no": 0,
  "student_no": 0,
  "name": "<string>",
  "password": "<example-password>",
  "gender": "<string>",
  "photo_url": "https://example.invalid/image",
  "consent_privacy": false,
  "created_at": "2026-09-21T10:00:00Z",
  "sessions": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "status": "<string>",
      "created_at": "2026-09-21T10:00:00Z",
      "completed_at": "2026-09-21T10:00:00Z",
      "answers": [
        {
          "stage": "<string>",
          "payload": {},
          "created_at": "2026-09-21T10:00:00Z"
        }
      ],
      "persona": {
        "name": "<string>",
        "tagline": "<string>",
        "keywords": [
          "<string>"
        ],
        "fields": [
          "<string>"
        ]
      },
      "card_image_url": "https://example.invalid/image"
    }
  ]
}
```

### AdminStudentItem

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `school` | string | 없음 |  |
| `grade` | integer | 없음 |  |
| `class_no` | integer | 없음 |  |
| `student_no` | integer | 없음 |  |
| `name` | string | 없음 |  |
| `password` | string | 없음 | 평문 비밀번호 — 관리자 전용 노출 |
| `gender` | string 또는 null | 있음 | 성별 ('male' \| 'female', 없으면 null) |
| `photo_url` | string 또는 null | 있음 | 사진 presigned URL (없으면 null) |
| `has_photo` | boolean | 있음 | 사진 보유 여부. include_photo=false여서 photo_url이 null이어도 유무를 알 수 있다. |
| `kind` | string | 있음 | 계정 종류 ('student' \| 'guest' \| 'test') |
| `consent_privacy` | boolean | 없음 |  |
| `created_at` | string (date-time) | 없음 |  |
| `progress` | AdminStudentProgress | 있음 |  |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "school": "<string>",
  "grade": 0,
  "class_no": 0,
  "student_no": 0,
  "name": "<string>",
  "password": "<example-password>",
  "gender": "<string>",
  "photo_url": "https://example.invalid/image",
  "has_photo": false,
  "kind": "<string>",
  "consent_privacy": false,
  "created_at": "2026-09-21T10:00:00Z",
  "progress": {
    "status": "not_started",
    "stages_done": [
      "<string>"
    ],
    "has_persona": false,
    "has_card": false,
    "last_activity_at": "2026-09-21T10:00:00Z"
  }
}
```

### AdminStudentList

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `total` | integer | 없음 |  |
| `items` | AdminStudentItem[] | 없음 |  |

```json
{
  "total": 0,
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "school": "<string>",
      "grade": 0,
      "class_no": 0,
      "student_no": 0,
      "name": "<string>",
      "password": "<example-password>",
      "gender": "<string>",
      "photo_url": "https://example.invalid/image",
      "has_photo": false,
      "kind": "<string>",
      "consent_privacy": false,
      "created_at": "2026-09-21T10:00:00Z",
      "progress": {
        "status": "not_started",
        "stages_done": [
          "<string>"
        ],
        "has_persona": false,
        "has_card": false,
        "last_activity_at": "2026-09-21T10:00:00Z"
      }
    }
  ]
}
```

### AdminStudentPhoto

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `photo_url` | string 또는 null | 있음 | 사진 presigned URL (없으면 null) |

```json
{
  "photo_url": "https://example.invalid/image"
}
```

### AdminStudentProgress

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `status` | "not_started" / "in_progress" / "completed" | 있음 |  |
| `stages_done` | string[] | 있음 |  |
| `has_persona` | boolean | 있음 |  |
| `has_card` | boolean | 있음 |  |
| `last_activity_at` | string (date-time) 또는 null | 있음 |  |

```json
{
  "status": "not_started",
  "stages_done": [
    "<string>"
  ],
  "has_persona": false,
  "has_card": false,
  "last_activity_at": "2026-09-21T10:00:00Z"
}
```

### AdminTestPurgeResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `deleted` | integer | 없음 |  |
| `removed_storage_objects` | integer | 있음 |  |

```json
{
  "deleted": 0,
  "removed_storage_objects": 0
}
```

### AdminTestStudent

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `name` | string | 없음 |  |
| `gender` | string | 없음 |  |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "<string>",
  "gender": "<string>"
}
```

### AdminTestToken

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `student_id` | string (uuid) | 없음 |  |
| `student_token` | string | 없음 | 학생 세션 JWT (Bearer) |

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "student_token": "<token>"
}
```

### BoothDeleteResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `booth_id` | string (uuid) | 없음 |  |

```json
{
  "booth_id": "00000000-0000-4000-8000-000000000001"
}
```

### BoothResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `code` | string | 없음 | 6자 부스 코드 — 발급 후 불변 |
| `name` | string | 없음 |  |
| `description` | string 또는 null | 있음 |  |
| `zone` | "F" / "L" / "Y" / "C" / "" | 있음 |  |
| `competencies` | string[] | 있음 |  |
| `qr_url` | string | 없음 | QR에 담을 링크 (FRONTEND_ORIGIN 기준) |
| `created_at` | string (date-time) | 없음 |  |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "code": "<string>",
  "name": "<string>",
  "description": "<string>",
  "zone": "F",
  "competencies": [
    "<string>"
  ],
  "qr_url": "https://example.invalid/image",
  "created_at": "2026-09-21T10:00:00Z"
}
```

### BoothStatsResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `booths` | BoothVisitStat[] | 없음 |  |
| `total_visits` | integer | 없음 | 연인원 — 부스별 방문 수의 합 |
| `unique_students` | integer | 없음 | 실인원 — 부스를 하나라도 찍은 학생 수 |

```json
{
  "booths": [
    {
      "booth_id": "00000000-0000-4000-8000-000000000001",
      "code": "<string>",
      "name": "<string>",
      "zone": "F",
      "visit_count": 0
    }
  ],
  "total_visits": 0,
  "unique_students": 0
}
```

### BoothVisitResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `code` | string | 없음 |  |
| `name` | string | 없음 |  |
| `visited_at` | string (date-time) | 없음 | 첫 방문 기록 시각 — 재방문해도 덮이지 않는다 |
| `already_visited` | boolean | 없음 | 이번 요청 전에 이미 기록이 있었으면 true (에러가 아니다) |

```json
{
  "code": "<string>",
  "name": "<string>",
  "visited_at": "2026-09-21T10:00:00Z",
  "already_visited": false
}
```

### BoothVisitStat

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `booth_id` | string (uuid) | 없음 |  |
| `code` | string | 없음 |  |
| `name` | string | 없음 |  |
| `zone` | "F" / "L" / "Y" / "C" / "" | 있음 |  |
| `visit_count` | integer | 없음 | 이 부스를 찍은 학생 수 |

```json
{
  "booth_id": "00000000-0000-4000-8000-000000000001",
  "code": "<string>",
  "name": "<string>",
  "zone": "F",
  "visit_count": 0
}
```

### CardSummary

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `card_image_url` | string 또는 null | 있음 | 카드 이미지 Presigned GET URL (만료 있음). 키가 없으면 null |

```json
{
  "card_image_url": "https://example.invalid/image"
}
```

### DefaultPromptsResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `persona_system_prompt` | string | 없음 |  |
| `future_photo_prompt` | string | 없음 |  |

```json
{
  "persona_system_prompt": "<string>",
  "future_photo_prompt": "<string>"
}
```

### DevStudent

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `name` | string | 없음 |  |
| `school` | string | 없음 |  |
| `grade` | integer | 없음 |  |
| `class_no` | integer | 없음 |  |
| `student_no` | integer | 없음 |  |
| `has_photo` | boolean | 없음 | 사진(photo_key)이 있는지 — 미래 사진 생성 가능 여부 |
| `photo_url` | string 또는 null | 있음 | 원본 사진 Presigned GET URL(1시간). 생성 결과와 나란히 비교하는 용도 |
| `has_answers` | boolean | 없음 | 설문 답변이 있는지 — 페르소나 생성 가능 여부 |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "<string>",
  "school": "<string>",
  "grade": 0,
  "class_no": 0,
  "student_no": 0,
  "has_photo": false,
  "photo_url": "https://example.invalid/image",
  "has_answers": false
}
```

### DraftItem

`DraftList`는 `{ "drafts": DraftItem[], "counts": {"pending": n, "approved": n, "rejected": n} }`,
`CardPreview`는 `{ "image_base64": "<PNG base64>" }`.

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 | 초안 ID (세션당 1개) |
| `student_id` | string (uuid) | 없음 |  |
| `status` | string | 없음 | pending \| approved \| rejected |
| `student_name`, `school`, `grade`, `class_no`, `student_no` | string / integer | 없음 | 카드 표시용 학생 정보 |
| `name` | string | 없음 | persona_name 전체 |
| `base_career` | string | 없음 | 카드 아랫줄(직업명) |
| `headline` | string | 없음 | 카드 윗줄(수식어) |
| `tagline` | string | 없음 | short_description |
| `source_career_pool`, `pool_extended` | boolean 또는 null | 없음 | Career Pool 내 여부 / 인접 확장 여부 |
| `raw` | object | 없음 | codex 출력 원본 |
| `photo_url`, `image_url` | string 또는 null | 있음 | 원본 사진 / 생성 이미지 Presigned URL |
| `error` | string 또는 null | 있음 | 마지막 이미지 생성 실패 사유 |
| `note` | string | 없음 | 검수 메모 |

### DevStudentList

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `students` | DevStudent[] | 없음 |  |

```json
{
  "students": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "name": "<string>",
      "school": "<string>",
      "grade": 0,
      "class_no": 0,
      "student_no": 0,
      "has_photo": false,
      "photo_url": "https://example.invalid/image",
      "has_answers": false
    }
  ]
}
```

### GenerateFuturePhotoResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `image_base64` | string | 없음 | 생성된 PNG의 base64 |
| `size_bytes` | integer | 없음 |  |
| `width` | integer | 없음 |  |
| `height` | integer | 없음 |  |
| `elapsed_seconds` | number | 없음 |  |

```json
{
  "image_base64": "<PNG base64>",
  "size_bytes": 0,
  "width": 0,
  "height": 0,
  "elapsed_seconds": 0
}
```

### GeneratePersonaResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `persona_name` | string | 없음 |  |
| `base_career` | string | 없음 |  |
| `short_description` | string | 없음 |  |
| `source_career_pool` | boolean | 없음 |  |
| `pool_extended` | boolean | 없음 |  |
| `q8_reflection` | string | 없음 |  |
| `q9_reflection` | string | 없음 |  |
| `user_prompt` | string | 없음 | 실제로 codex에 보낸 user 프롬프트 (디버깅용) |
| `elapsed_seconds` | number | 없음 |  |

```json
{
  "persona_name": "<string>",
  "base_career": "<string>",
  "short_description": "<string>",
  "source_career_pool": false,
  "pool_extended": false,
  "q8_reflection": "<string>",
  "q9_reflection": "<string>",
  "user_prompt": "<string>",
  "elapsed_seconds": 0
}
```

### LoginResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `student_id` | string (uuid) | 없음 |  |
| `student_token` | string | 없음 | 학생 세션 JWT (Bearer) |

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "student_token": "<token>"
}
```

### OperatorLoginResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `operator_token` | string | 없음 | 운영진 세션 JWT (Bearer) |

```json
{
  "operator_token": "<token>"
}
```

### PersonaSummary

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `name` | string | 없음 |  |
| `tagline` | string | 있음 |  |
| `keywords` | string[] | 있음 |  |
| `fields` | string[] | 있음 |  |

```json
{
  "name": "<string>",
  "tagline": "<string>",
  "keywords": [
    "<string>"
  ],
  "fields": [
    "<string>"
  ]
}
```

### PhotoUploadResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `photo_key` | string | 없음 | Storage에 저장된 사진 경로(키) |

```json
{
  "photo_key": "<string>"
}
```

### ProfileBoothStatus

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `id` | string (uuid) | 없음 |  |
| `name` | string | 없음 |  |
| `visited` | boolean | 없음 | 이 학생이 이 부스에 방문 기록을 남겼는지 |
| `zone` | string | 있음 | 'F'·'L'·'Y'·'C' 중 하나. 존을 모르는 부스는 빈 문자열 |
| `description` | string 또는 null | 있음 | 직업체험은 기관명, 역량체험은 미션 활동 |
| `competencies` | string[] | 있음 | 이 부스에 연결된 역량 키. 매핑 전이면 빈 목록 |
| `visited_at` | string (date-time) 또는 null | 있음 | 첫 방문 시각. 미방문이면 null |

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "<string>",
  "visited": false,
  "zone": "<string>",
  "description": "<string>",
  "competencies": [
    "<string>"
  ],
  "visited_at": "2026-09-21T10:00:00Z"
}
```

### ProfileCompetencyScore

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `key` | string | 없음 | 역량 키 (app/core/competencies.py) |
| `label` | string | 없음 | 화면에 쓰는 한글 이름 |
| `score` | integer | 없음 | 이 역량을 다루는 부스를 방문한 횟수 |

```json
{
  "key": "<string>",
  "label": "<string>",
  "score": 0
}
```

### ProfileSummary

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `has_completed` | boolean | 없음 |  |
| `completed_session_id` | string (uuid) 또는 null | 있음 |  |
| `retry_enabled` | boolean | 없음 |  |
| `student` | StudentInfo 또는 null | 있음 |  |
| `persona` | PersonaSummary 또는 null | 있음 |  |
| `card` | CardSummary 또는 null | 있음 |  |
| `booths` | ProfileBoothStatus[] | 있음 |  |
| `competencies` | ProfileCompetencyScore[] | 있음 |  |

```json
{
  "has_completed": false,
  "completed_session_id": "00000000-0000-4000-8000-000000000001",
  "retry_enabled": false,
  "student": {
    "school": "<string>",
    "grade": 0,
    "class_no": 0,
    "student_no": 0,
    "name": "<string>",
    "gender": "<string>",
    "photo_url": "https://example.invalid/image"
  },
  "persona": {
    "name": "<string>",
    "tagline": "<string>",
    "keywords": [
      "<string>"
    ],
    "fields": [
      "<string>"
    ]
  },
  "card": {
    "card_image_url": "https://example.invalid/image"
  },
  "booths": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "name": "<string>",
      "visited": false,
      "zone": "<string>",
      "description": "<string>",
      "competencies": [
        "<string>"
      ],
      "visited_at": "2026-09-21T10:00:00Z"
    }
  ],
  "competencies": [
    {
      "key": "<string>",
      "label": "<string>",
      "score": 0
    }
  ]
}
```

### RegisterResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `student_id` | string (uuid) | 없음 |  |
| `student_token` | string | 없음 | 학생 세션 JWT (Bearer) |

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "student_token": "<token>"
}
```

### SaveAnswerResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `session_id` | string (uuid) | 없음 |  |

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001"
}
```

### StudentAnswersResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `session_id` | string (uuid) 또는 null | 없음 |  |
| `status` | string 또는 null | 없음 |  |
| `riasec_scores` | 키: integer 형태의 객체 | 없음 |  |
| `pair_code` | string | 없음 |  |
| `career_pool` | string 배열 | 없음 | Pair Code 기본 Career Pool (편집 초깃값) |
| `q7a_first` | string 또는 null | 없음 |  |
| `q7a_second` | string 또는 null | 없음 |  |
| `q7b_first` | string 또는 null | 없음 |  |
| `q7b_second` | string 또는 null | 없음 |  |
| `q8_response` | string 또는 null | 없음 |  |
| `q9_response` | string 또는 null | 없음 |  |

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "status": "<string>",
  "riasec_scores": {},
  "pair_code": "<string>",
  "career_pool": ["<string>"],
  "q7a_first": "<string>",
  "q7a_second": "<string>",
  "q7b_first": "<string>",
  "q7b_second": "<string>",
  "q8_response": "<string>",
  "q9_response": "<string>"
}
```

### StudentBoothResponse

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `code` | string | 없음 |  |
| `name` | string | 없음 |  |
| `description` | string 또는 null | 있음 |  |
| `visited` | boolean | 없음 | 이 학생이 이미 방문 기록을 남겼는지 |
| `visited_at` | string (date-time) 또는 null | 있음 | 첫 방문 기록 시각 (visited=false면 null) |

```json
{
  "code": "<string>",
  "name": "<string>",
  "description": "<string>",
  "visited": false,
  "visited_at": "2026-09-21T10:00:00Z"
}
```

### StudentInfo

| 필드 | 타입 | 기본값 여부 | 설명 |
|---|---|---|---|
| `school` | string | 없음 |  |
| `grade` | integer | 없음 |  |
| `class_no` | integer | 없음 |  |
| `student_no` | integer | 없음 |  |
| `name` | string | 없음 |  |
| `gender` | string 또는 null | 있음 | 성별 ('male' \| 'female'). 과거 가입자는 null일 수 있음 |
| `photo_url` | string 또는 null | 있음 | 학생 사진 Presigned GET URL (만료 있음). 사진이 없으면 null |

```json
{
  "school": "<string>",
  "grade": 0,
  "class_no": 0,
  "student_no": 0,
  "name": "<string>",
  "gender": "<string>",
  "photo_url": "https://example.invalid/image"
}
```

## AI 질문 생성: POST /api/generate/{stage}

학생 토큰이 필요하며 stage는 `q7b`, `q8`, `q9`입니다. 아래는 프롬프트가 요구하는 형태입니다. 서버는 JSON 파싱과 최상위 stage 키의 존재를 검사하며 중첩 필드 전체를 Pydantic으로 검증하지 않습니다. 배열은 형태를 보여주기 위해 한 항목만 표시했고 프롬프트에서는 각 6개를 요구합니다.

### q7b

```json
{
  "q7b": {
    "title": "선택한 캠프 공간에서 너만의 시간을 보낼 때 사용할 도구는?",
    "intro": "캠프에 등불이 켜지고 별빛 프로그램이 시작됐어요. 방금 고른 두 공간에서 해보고 싶은 활동을 떠올리며, 가장 마음이 가는 탐험 도구를 1순위와 2순위로 골라주세요.",
    "selection_rule": "6개 중 1순위와 2순위 선택",
    "options": [
      {
        "subfield_id": "SUB_01",
        "student_title": "",
        "student_description": "",
        "backend_subfield": "",
        "backend_keywords": [],
        "career_pool": [],
        "persona_material_keywords": []
      }
    ]
  }
}
```

### q8

```json
{
  "q8": {
    "title": "고른 탐험 도구로 어떤 활동을 해볼까?",
    "intro": "지금까지의 선택을 바탕으로, 고른 도구를 사용하는 방식에 어울릴 만한 표현들이 열렸습니다.",
    "answer_type": "word_chips_plus_free_text",
    "selection_rule": "후보 중 1~2개를 고르거나 직접 입력",
    "student_prompt": "가장 나답다고 느껴지는 표현을 골라주세요.",
    "word_chips": [
      {
        "chip_id": "ATT_01",
        "text": "",
        "why_generated_backend": "",
        "persona_usage_hint": ""
      }
    ],
    "free_text_placeholder": "내가 원하는 표현을 직접 써도 좋아요."
  }
}
```

### q9

```json
{
  "q9": {
    "title": "고른 탐험 도구로 무엇을 더 살펴보고 싶어?",
    "intro": "당신이 고른 도구와 탐험 방식을 떠올리며, 특히 마음이 가는 대상이나 장면을 골라주세요.",
    "answer_type": "topic_chips_plus_free_text",
    "selection_rule": "후보 중 1~2개를 고르거나 직접 입력",
    "student_prompt": "가장 마음이 가는 표현을 골라주세요.",
    "topic_chips": [
      {
        "chip_id": "TOPIC_01",
        "text": "",
        "why_generated_backend": "",
        "persona_usage_hint": ""
      }
    ],
    "free_text_placeholder": "내가 더 관심 있는 대상을 직접 써도 좋아요."
  }
}
```

## 공통 오류 응답

도메인 오류는 다음 형태입니다.

```json
{
  "error": {
    "code": "unauthorized",
    "message": "인증 토큰이 필요합니다.",
    "details": {}
  }
}
```

| HTTP | code | 의미 |
|---|---|---|
| 400 | domain_error | 형식·업무 규칙 오류 |
| 401 | unauthorized | 인증 누락/만료/잘못된 토큰 |
| 403 | forbidden | 해당 자원 접근 권한 없음 |
| 404 | not_found | 자원 또는 생성 stage 없음 |
| 409 | conflict | 중복·상태·사진 수정 충돌 |
| 409 | session_completed | 해당 설문 세션 완료됨 |
| 409 | session_superseded | 다른 설문 시도로 교체됨 |
| 422 | invalid_stage | 저장할 수 없는 설문 단계 |
| 429 | rate_limited | 요청 제한 |
| 502 | external_service_error | 외부 AI 등 처리 실패 |

각 API가 이 오류를 모두 발생시키는 것은 아닙니다. OpenAPI에는 도메인 오류가 일괄 명시되지 않습니다.

FastAPI 요청 검증 실패는 다른 구조입니다(422). 실제 항목에 따라 input/ctx 등이 추가될 수 있습니다.

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": [
        "body",
        "name"
      ],
      "msg": "Field required",
      "input": {}
    }
  ]
}
```

등록되지 않은 경로는 `{"detail":"Not Found"}`(404)이며, 미구현/미처리 서버 예외의 500은 위 error JSON 형태를 보장하지 않습니다.
