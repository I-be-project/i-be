# 부하테스트 (k6)

학생 정상 플로우(`프로필 조회 → 설문 답변 저장 → 완료 → 재조회`)에 부하를 준다.
관리자 API로 발급한 **테스트 계정(`kind='test'`)만** 사용하므로 실제 참가자 데이터는 건드리지 않는다.

## 준비

1. **k6 설치 확인** — `k6 version`. 방금 설치했는데 `command not found`가 뜨면 PATH가
   아직 갱신되지 않은 것이니 터미널을 새로 연다. (Windows 기본 설치 경로는 `C:\Program Files\k6\k6.exe`)

2. **`backend/.env` 채우기** — `ADMIN_USERNAME` / `ADMIN_PASSWORD`를 스크립트가 자동으로 읽는다.
   `-e`로 직접 넘기면 그 값이 우선한다.

3. **백엔드 실행** — `cd backend && uv run uvicorn app.main:app --reload`

## 실행

```bash
# 1) 스크립트가 제대로 도는지 먼저 확인 (VU 1개, 30초 — 부하 아님)
k6 run -e PROFILE=smoke backend/loadtest/student-flow.js

# 2) 실제 부하 (VU 10→30 램프, 3분 30초)
k6 run backend/loadtest/student-flow.js

# 3) 한계 확인 (VU 30→100 램프, 4분)
k6 run -e PROFILE=stress backend/loadtest/student-flow.js
```

**smoke를 먼저 돌린다.** 계정 발급·토큰·설문 저장·정리까지 한 바퀴가 도는지 30초 만에 확인할 수 있고,
여기서 깨지면 부하 수치는 볼 필요가 없다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PROFILE` | `load` | `smoke`(VU 1/30초) · `load`(10→30/3분30초) · `stress`(30→100/4분) |
| `BASE_URL` | `http://localhost:8000` | 대상 서버. 미지정 시 `.env`의 `APP_BASE_URL` 사용 |
| `ADMIN_USERNAME` | `.env`에서 읽음 | 테스트 계정 발급·삭제에 필요 |
| `ADMIN_PASSWORD` | `.env`에서 읽음 | 〃 |
| `ACCOUNTS` | 프로필 최대 VU 수 | 미리 만들어둘 테스트 계정 수 |
| `INCLUDE_PHOTO` | `false` | `true`면 더미 사진을 **실제 S3에 업로드**. 켤 때 주의 |
| `ADMIN_READ_VUS` | `0` | >0이면 관리자 조회 API에도 동시에 부하 |
| `SCHOOL` | `테스트` | 반별 진행 현황 조회에 쓸 학교명 |
| `KEEP_ACCOUNTS` | `false` | `true`면 종료 후 테스트 계정을 안 지움(디버깅용) |
| `P95_MS` | `800` | `http_req_duration` p(95) 임계값(ms) |
| `ERROR_RATE` | `0.01` | `http_req_failed` 허용 비율 |

## 측정 대상에서 뺀 것

- **AI 호출 엔드포인트** (`POST /api/generate/{stage}`, `/api/dev/*`) — 호출당 실제 비용이 발생한다.
  `POST /api/sessions/complete`는 persona 없이 호출하므로 AI를 태우지 않는다.
- **부스 체크인** (`/api/booths/{code}`) — 카드 발급(`POST /api/cards/generate`)이 미구현이라
  테스트 계정이 `has_card=true`가 될 수 없고, 그 상태로 찍으면 항상 403이라 지금은 의미가 없다.
  카드 발급이 구현되면 이어서 추가한다.

임계값은 `{phase:main}` 태그가 붙은 요청만 본다. setup/teardown의 계정 발급·정리 요청이
응답시간·실패율 통계를 오염시키지 않게 하려는 것이다.

## 뒷정리

`teardown()`이 `DELETE /api/admin/students/test`로 테스트 계정을 전부 지운다.
DB는 cascade로 세션·답변까지, S3는 사진·카드 이미지까지 함께 정리된다.
setup에서도 시작 전에 한 번 지우므로, 이전 실행이 `Ctrl+C`로 끊겨 계정이 남았어도 다음 실행이 알아서 치운다.

수동으로 지우려면:

```bash
curl -X DELETE $BASE_URL/api/admin/students/test -H "Authorization: Bearer <admin_token>"
```

## 주의

- **`BASE_URL`을 운영 서버(`https://api.cnu-likelion.kr`)로 두지 않는다.** 운영 DB에 테스트 계정이
  생성·삭제되고, `INCLUDE_PHOTO=true`면 운영 S3에 쓰기까지 발생한다. 로컬이나 스테이징에서 돌린다.
- `.env`의 `DATABASE_URL`이 공용 Supabase를 가리키면 로컬 실행이어도 결국 그 DB에 부하가 간다.
  실행 전에 어느 DB를 보고 있는지 확인한다.
