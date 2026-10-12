# 페인트팜(나비) 연동

페인트팜(나비 시뮬레이터)과 주고받는 데이터. 방향은 둘이다.

| 방향 | 방식 | 인증 |
|---|---|---|
| **우리 → 페인트팜** | 페인트팜이 우리 **내보내기 API**(`/api/export/v1`)를 조회해 가져간다 | `EXPORT_API_KEY` (조회 전용, 받는 쪽에만 전달) |
| **페인트팜 → 우리** | 우리 서버가 페인트팜 **나비 결과 API**를 조회해 카드 뒷면에 띄운다 | `NABI_API_TOKEN` |

키 값은 서버 `backend/.env`에만 둔다. 이 문서·코드·로그에 적지 않는다.

---

## 1. 페인트팜이 가져가는 것 (내보내기 API)

페인트팜이 필요할 때 조회한다(우리가 밀어 넣지 않는다). 학생 1명 단위 객체에 아래가 담긴다.
필드 형식·예시는 [`export-api.md`](export-api.md).

| 데이터 | 언제 생기나 (학생 화면 기준) | 필드 |
|---|---|---|
| 학생 정보 | 회원가입 | `id` · `kind` · `school` · `grade` · `class_no` · `student_no` · `name` · `gender` · `birth_date` · `consent_privacy` · `created_at` |
| 설문 응답 | 탐험 설문(Q1~Q9) — 완료한 최신 설문, 없으면 최근 설문 | `survey.status` · `riasec` · `pair_code` · `answers`(질문·답) |
| 원본 사진 | 사진 등록 | `photo_url` |
| 방문 부스 | 부스 QR 방문 기록 | `booths`(방문 순, `visited_at`) |
| 역량 점수 | 부스 방문이 쌓일 때마다 | `competency_scores`(역량 10종, 방문한 부스의 역량마다 1점) |
| 페르소나 · AI 인물 이미지 | 카드 공개(승인) 뒤 | `persona.name` · `headline` · `base_career` · `tagline` · `competencies` · `image_url` · `approved_at` |
| 부스 목록 | (운영 데이터) | `GET /booths` — 부스 `id` · `name` · `zone` · `description` · `competencies` |

- 엔드포인트: `GET /students`(목록, 커서 페이지) · `GET /students/{id}`(1명) · `GET /booths`.
- `persona`는 카드가 공개되기 전이면 `null`이다. `image_url`은 AI 사진이 없으면(거절 등) `null`.
- `photo_url` · `persona.image_url`은 **1시간 뒤 만료되는 서명 URL**이다 — 받는 즉시 내려받아야 한다.
- 테스트 계정(`kind: test`)은 목록에 없고 1명 조회로만 나온다.
- 비밀번호는 보내지 않는다.

## 2. 우리가 받아오는 것 (나비 결과 API)

| 항목 | 내용 |
|---|---|
| 호출 | `GET {NABI_API_URL}/{student_id}` (Bearer `NABI_API_TOKEN`) — `backend/app/adapters/nabi_client.py` |
| 응답 | `status`(`done` · `processing` · `pending` · `failed`) + `done`일 때 `image_url`(30일 서명 URL, 저장하지 않고 그대로 넘김) |
| 쓰는 곳 | 개인 홈·공개 홈의 **페르소나 카드 뒷면**(`/api/students/me/nabi` · `/api/students/shared/{code}/nabi`) |
| 그림이 없을 때 | `done`이 아니거나 호출 실패(토큰 없음·타임아웃·5xx)면 기본 뒷면("15:00 이후 … 확인해보세요!") |
| 캐시 | 같은 학생 연속 조회는 20초 메모리 캐시 |

## 3. 두 방향이 이어지는 경우

나비 결과를 조회할 때 페인트팜이 아직 그 학생 데이터를 처리하기 전이면, **페인트팜 서버가 우리 내보내기
API(1명 조회)를 한 번 되부른다.** 그래서 같은 학생의 나비 결과 조회는 짧게 캐시한다(위 20초).

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-10-12 | 페인트팜 연동 개요 v1 — 내보내기 API로 가져가는 데이터, 나비 결과 API로 받아오는 데이터 |
