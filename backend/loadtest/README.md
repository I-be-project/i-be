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

# 2) 평상시 부하 (동시 학생 100명, 7분)
k6 run backend/loadtest/student-flow.js

# 3) 피크 (동시 학생 250명, 7분) — 실제 행사에서 버텨야 하는 선
k6 run -e PROFILE=peak backend/loadtest/student-flow.js

# 4) 한계 확인 (동시 학생 800명, 8분)
k6 run -e PROFILE=stress backend/loadtest/student-flow.js

# 규모만 임시로 바꿔 보기 (램프 모양은 유지하고 최대 VU만 교체)
k6 run -e PROFILE=peak -e VUS=400 backend/loadtest/student-flow.js
```

**항상 smoke를 먼저 돌린다.** 계정 발급·토큰·설문 저장·정리까지 한 바퀴가 도는지 30초 만에
확인할 수 있고, 여기서 깨지면 부하 수치는 볼 필요가 없다.

## VU 수는 어떻게 나온 값인가

목표 규모 **하루 1만 명**에서 Little's Law(`동시 사용자 = 도착률 × 체류시간`)로 뽑았다.

- 8시간 운영 → 도착률 `10,000 / 28,800초 ≈ 0.35명/초`
- 학생 1명 체류시간은 LLM 질문 생성이 3번(각 수십 초) 끼므로 **5~10분**
- 평균 동시 사용자 = `0.35 × 300~600초` ≈ **100~210명**
- 학교·반 단위로 몰리는 피크는 평균의 2~3배 → **250~500명**

| 프로필 | 최대 VU | LLM 대기 | 길이 | 용도 |
|---|---|---|---|---|
| `smoke` | 1 | 없음 | 30초 | 스크립트 검증. 부하 아님 |
| `load` | 100 | 10초×3 | 7분 | 평상시 동시 사용자 |
| `peak` | 250 | 10초×3 | 7분 | 반 단위 몰림. **여기서 통과해야 한다** |
| `stress` | 800 | 10초×3 | 8분 | 어디서 깨지는지 확인 |

`llmWait` 덕분에 **VU 1명이 실제 학생 1명에 대응**한다. 위 계산으로 나온 동시 사용자 수를
그대로 VU 수로 쓰면 된다.

운영 시간이나 체류시간 가정이 바뀌면 위 식으로 다시 계산해 `student-flow.js`의 `PROFILES`를 고친다.

## 실측 결과 (2026-09-09, 테스트 서버)

대상은 AWS 서울의 테스트 서버(uvicorn 단일 워커, Supabase `max_connections=60`).
k6는 개발 PC에서 실행했으므로 **네트워크 왕복(최소 약 10~15ms)이 모든 수치에 포함**되어 있다.

| 프로필 | 동시 학생 | LLM 대기 | median | p(95) | 처리량 | 에러 |
|---|---|---|---|---|---|---|
| `smoke` | 1 | 없음 | 46.9ms | 142.3ms | — | 0 |
| `load` | 100 | 없음 | 57.8ms | 154.5ms | 117 req/s | 0 |
| (참고) | 250 | **없음** | 298.5ms | **1.53s** | 176 req/s | 0 |
| `peak` | 250 | 10초×3 | **42.2ms** | **127.7ms** | 41.8 req/s | 0 |
| `stress` | 800 | 10초×3 | 56.5ms | **172.2ms** | 121 req/s | 0 |

**LLM 대기가 결론을 뒤집는다.** 같은 250 VU인데 대기 없이 재면 p95가 1.53초로 임계값을 넘고,
대기를 넣으면 127.7ms로 통과한다. 대기 없는 250 VU는 실제로는 학생 1,750명분 압력이기 때문이다.
이 표의 세 번째 행은 그 함정을 남겨두기 위한 참고용이다.

### 지금 아는 것

- **동시 학생 800명까지 p95 172ms, 에러 0.** 예상 피크(250~500명)의 1.6~3배까지 실측으로 확인됐다.
- 250명 → 800명으로 3.2배 늘렸는데 p95는 128ms → 172ms(34%)만 올랐다. 아직 선형 구간이다.
- 따라서 아래 "DB 커넥션 풀 10개"와 "uvicorn 단일 워커"는 실재하는 제약이지만
  **현재 목표 규모에서는 물리지 않는다.** 지금 손댈 이유는 없다.

### 병목을 정하는 건 req/s가 아니라 동시 in-flight 수다

이 테스트에서 제일 중요한 발견이다.

| | 대기 없는 250 VU | 대기 있는 800 VU |
|---|---|---|
| 순간 처리량 | ~176 req/s | ~182 req/s |
| p(95) | **1.53s** | **172ms** |

**처리량은 거의 같은데 p95는 9배 차이 난다.** 차이는 동시에 서버에 떠 있는 요청 수다.

- 대기 없는 250 VU: 사이클 ~600ms 중 응답 대기가 ~300ms → in-flight ≈ 250 × 0.5 ≈ **125개**
- 대기 있는 800 VU: 사이클 35.1초 중 응답 대기가 8×56ms ≈ 450ms → in-flight ≈ 800 × 0.013 ≈ **10개**

DB 커넥션이 10개다. 전자는 125개 요청이 커넥션 10개를 두고 다퉈 큐가 쌓였고, 후자는 수요와 공급이
맞아떨어졌다. **평균 req/s만 보고 용량을 판단하면 안 된다.**

이 관점에서 추정하면 in-flight가 10을 넘기 시작하는 **동시 학생 1,500명 근처**부터 꺾일 것으로
보인다. 다만 거기까지는 실측하지 않았다.

### 포화 상태의 신호

에러율이 오르는 게 아니라 **응답시간만 늘어난다.** 250 VU(대기 없음)에서 에러는 0인데
median이 5배, p95가 10배 뛰었다. 요청이 실패하는 게 아니라 커넥션·이벤트 루프를 기다리며
큐에 쌓이기 때문이다. `http_req_failed`만 보면 정상으로 보이니 **응답시간 분포를 함께 봐야 한다.**

## ⚠ 돌리기 전에 알아야 할 것

### DB 커넥션 풀이 10개로 하드코딩되어 있다

`app/adapters/db_pool.py`의 `connect(min_size=1, max_size=10)`을 `app/main.py`가 인자 없이
호출한다. **env로 조절할 수 없다.**

학생 플로우는 요청마다 DB를 친다. 특히 `GET /api/students/me`(`get_profile_summary`)는 한 번에
학생·설정·세션·페르소나·부스를 조회해서 왕복이 여러 번이다. 커넥션이 10개뿐이라
어느 지점부터는 그 위로 큐가 쌓인다.

**다만 실측상 그 지점은 예상 피크보다 한참 위다** — 위 실측 결과 참조. 동시 학생 250명에서는
p95 128ms로 여유가 있었고, 포화는 176 req/s(동시 학생 약 770명 상당) 근처에서 나타났다.
`stress`에서 p95가 치솟고 에러 없이 느려지기만 한다면 여기(또는 아래 워커 수)가 범인일 수 있다.

풀 크기를 올릴 거면 Supabase 상한을 먼저 확인한다. 실측 기준 `max_connections=60`,
superuser 예약 3개, Supabase 내부 서비스가 13개를 쓰고 있어 **앱이 쓸 수 있는 건 약 44개**다.
uvicorn 워커를 여러 개 띄우면 워커마다 풀을 따로 만들므로 `워커 수 × max_size`가 실제 연결 수다.

### uvicorn이 단일 워커다

`backend/Dockerfile`의 `CMD`에 `--workers` 플래그가 없어 프로세스 하나로 뜬다. FastAPI가 async라
I/O 대기 중엔 다른 요청을 처리하지만, Pydantic 검증·JSON 직렬화 같은 CPU 작업은 코어 하나에서
순차로 돈다. 포화가 오면 DB 커넥션과 이쪽 중 어느 게 먼저인지 구분해야 한다.

**구분법:** 부하 중에 `GET /healthz`를 찔러본다. 이 엔드포인트는 DB를 전혀 안 탄다.
같이 느려지면 앱 프로세스(CPU/이벤트 루프)가, 계속 빠르면 DB 커넥션 풀이 범인이다.

로컬에서 잴 때는 `--reload`를 빼고 띄운다. 파일 감시 오버헤드가 수치를 왜곡한다.

### 어느 DB를 보고 있는지 확인한다

`.env`의 `DATABASE_URL`이 공용 Supabase를 가리키면 로컬 실행이어도 결국 그 DB에 부하가 간다.
`stress` 기준 테스트 계정 800개 + 세션·답변 수천 건이 생겼다 지워진다.

### `BASE_URL`을 운영 서버로 두지 않는다

`https://api.cnu-likelion.kr`로 돌리면 운영 DB에 테스트 계정이 생성·삭제되고,
`INCLUDE_PHOTO=true`면 운영 S3에 쓰기까지 발생한다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PROFILE` | `load` | `smoke` · `load` · `peak` · `stress` |
| `VUS` | (프로필 값) | 프로필의 최대 VU만 교체. 램프 모양은 비율대로 유지 |
| `LLM_WAIT` | `10` (smoke는 `0`) | q7b·q8·q9 저장 직전 대기(초). `0`이면 대기 없음 |
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

## 측정 대상

VU 1명이 아래 한 바퀴를 반복한다. 요청 8번 + 대기 합 약 34.5초(LLM 대기 10초×3 포함).

1. `GET /api/students/me` — 프로필 조회
2. `POST /api/sessions/answers` × 5 — `q1to6`·`q7a`·`q7b`·`q8`·`q9` 답변 저장
   - `q7b`·`q8`·`q9` **직전에 각각 10초 대기** — 프론트가 `POST /api/generate/{stage}`로
     LLM 질문을 받아오는 구간을 재현한다. 생성 API를 실제로 부르지는 않는다(비용).
3. `POST /api/sessions/complete` — 설문 완료
4. `GET /api/students/me` — 완료 후 재조회

이 대기가 **측정의 의미를 결정한다.** 대기가 없으면 VU 하나가 5초마다 설문을 완주해서
실제 학생보다 수십 배 센 압력이 걸리고, "VU 250 = 학생 250명"이라는 해석이 성립하지 않는다.

`ADMIN_READ_VUS`를 주면 관리자 조회 3종(`/admin/students`, `/admin/booths/stats`,
`/admin/progress/classes`)에도 동시에 부하가 간다. 실제 행사에서는 학생이 설문을 도는 동안
운영진이 대시보드를 새로고침하므로, 이 조합을 한 번은 재보는 게 좋다.

임계값은 `{phase:main}` 태그가 붙은 요청만 본다. setup/teardown의 계정 발급·정리 요청이
응답시간·실패율 통계를 오염시키지 않게 하려는 것이다.

## AI 비용 안전장치

AI(OpenRouter)를 실제로 호출하는 코드는 두 군데뿐이고 **둘 다 여기서 부르지 않는다.**

- `POST /api/generate/{stage}` (`app/routers/questions.py`) — Q7-B/Q8/Q9 질문 **생성**
- `/api/dev/*` (`app/routers/dev.py`) — 이미지·카드·페르소나 생성

> **헷갈리기 쉬운 부분:** `q7b`/`q8`/`q9`라는 이름이 두 군데에 나온다.
> `POST /api/generate/q7b`는 질문을 **생성**하며 LLM을 타고 수십 초 걸린다(프론트 타임아웃 60초).
> 반면 이 스크립트가 부르는 `POST /api/sessions/answers {stage:"q7b"}`는 학생이 고른 답을
> **저장**할 뿐이라 DB insert만 한다. 이름만 같고 다른 엔드포인트다.

간접 경로가 AI를 타지 않는 것도 확인했다.

- `POST /api/sessions/complete` → persona 없이 호출하므로 `personas.create`를 건너뛴다
- `GET /api/students/me` → `get_profile_summary`는 DB 조회만 한다
- 카드 워커 → `_claim_next_job()`이 아직 스텁(`return None`)이고 `POST /api/cards/generate`도
  `NotImplementedError`라 잡이 큐에 쌓이지 않는다

**⚠ 카드 발급이 구현되면 이 안전장치가 깨진다.** `complete`가 카드 생성 잡을 큐에 넣기 시작하면
워커가 VU 반복 횟수만큼 AI 이미지를 생성한다(`peak` 기준 수천 건). 그때는 서버의
`CARD_WORKER_ENABLED=false`로 워커를 꺼두고 돌려야 한다.

## 측정 대상에서 뺀 것

- **AI 엔드포인트 호출** — 위 참조. 호출당 실제 비용이 발생한다.
  다만 **기다리는 시간은 `LLM_WAIT`으로 재현**하므로 동시성 모델은 실제와 같다.
  측정되지 않는 건 LLM 호출 자체가 서버에 주는 부하(httpx 커넥션 점유, 이벤트 루프 대기)다.
- **부스 체크인** (`/api/booths/{code}`) — 카드 발급이 미구현이라 테스트 계정이
  `has_card=true`가 될 수 없고, 그 상태로 찍으면 항상 403이라 지금은 의미가 없다.
- **학생 회원가입·로그인** (`/api/auth/*`) — 관리자 API로 토큰을 직접 발급받아 우회한다.

## 뒷정리

`teardown()`이 `DELETE /api/admin/students/test`로 테스트 계정을 전부 지운다.
DB는 cascade로 세션·답변까지, S3는 사진·카드 이미지까지 함께 정리된다.
setup에서도 시작 전에 한 번 지우므로, 이전 실행이 `Ctrl+C`로 끊겨 계정이 남았어도
다음 실행이 알아서 치운다.

수동으로 지우려면:

```bash
curl -X DELETE $BASE_URL/api/admin/students/test -H "Authorization: Bearer <admin_token>"
```
