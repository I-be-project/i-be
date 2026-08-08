# 배포 가이드 (DEPLOYMENT)

배포할 때 보는 문서. 로컬 개발은 [`DEVELOPMENT.md`](DEVELOPMENT.md) 참고.

백엔드는 Docker로 배포한다. 관련 파일은 모두 `backend/` 안에 있다.

| 파일 | 용도 |
|---|---|
| `backend/Dockerfile` | FastAPI 앱 이미지 |
| `backend/docker-compose.yml` | 앱 단독 실행 (코드 볼륨 마운트) |
| `backend/compose.prod.yml` | 운영 오버라이드 (앱 + Caddy 자동 HTTPS) |
| `backend/Caddyfile` | 리버스 프록시 (`api.cnu-likelion.kr` → `app:8000`) |

---

## 백엔드 배포 (Docker)

운영 구성은 `compose.prod.yml` 기준:
- `app`: FastAPI 컨테이너. 외부 publish 없이 `expose: 8000` (Caddy만 내부 접근).
- `caddy`: 리버스 프록시 + 자동 HTTPS.

**빌드 + 기동**
```bash
cd backend
# .env 작성 (운영값) — git 커밋 금지
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build app caddy
```

**재배포 (코드 갱신 후) — 수동**
```bash
cd backend
git pull
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build app
docker image prune -f
```

> 평소에는 아래 **CD 자동 배포**가 이 과정을 대신한다. 수동 재배포는 폴백용.

**상태 확인**
```bash
docker compose -f docker-compose.yml -f compose.prod.yml logs -f app
curl https://api.cnu-likelion.kr/healthz
```

---

## CD 자동 배포 (백엔드)

`production` 브랜치에 `backend/**` 변경이 push되면 GitHub Actions가 서버에 SSH로
접속해 자동 재배포한다. 워크플로: [`.github/workflows/deploy-backend.yml`](.github/workflows/deploy-backend.yml)

**동작 흐름**
1. `production`에 backend 변경 push (또는 Actions 탭에서 수동 실행)
2. **`test` 잡이 품질 게이트 4종 실행** — `ruff check` · `ruff format --check` · `mypy app` · `pytest`
3. 하나라도 실패하면 여기서 중단 — `deploy` 잡은 시작되지 않는다
4. Actions가 서버 SSH 접속 → `git reset --hard origin/production`
5. `docker compose ... up -d --build app` + `docker image prune -f`
6. `https://api.cnu-likelion.kr/healthz` 헬스체크로 배포 성공 검증

`production`으로 향하는 PR에서도 `test` 잡이 돌아 머지 전에 실패를 잡는다(배포는 하지 않음).
CI에는 `backend/.env`가 없으므로, 테스트는 환경변수 없이도 통과해야 한다.

**필요한 GitHub Secrets** (Settings → Secrets and variables → Actions)

| Secret | 용도 | 예시 |
|---|---|---|
| `SSH_HOST` | 배포 서버 주소 | `1.2.3.4` 또는 도메인 |
| `SSH_USER` | 배포 유저 | `deploy` |
| `SSH_KEY` | 접속용 **개인키** (전체 내용) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_PORT` | SSH 포트 (선택, 기본 22) | `22` |
| `DEPLOY_PATH` | 서버의 저장소 루트 경로 | `/home/deploy/i-be` |

**서버 사전 준비 (최초 1회)**
- 이 저장소를 서버에 클론하고 `production` 브랜치 체크아웃.
- `backend/.env`(운영값)를 서버에 배치 — git 미추적이라 재배포로 덮이지 않는다.
- 배포 유저가 `docker` 명령을 실행할 권한을 가질 것 (docker 그룹).
- `SSH_KEY`에 넣은 개인키의 공개키를 서버 `~/.ssh/authorized_keys`에 등록.

> `git reset --hard`는 gitignore된 `backend/.env`를 건드리지 않는다. 다만 서버 저장소에
> 커밋되지 않은 추적 파일 수정이 있으면 버려지므로, 서버에서는 코드를 직접 수정하지 않는다.

---

## 환경변수

- 운영값은 `backend/.env`에 둔다 (`.env.example` 참고).
- `.env`는 `.gitignore`에 포함 — **절대 git에 커밋하지 않는다.**
- 시크릿(`SUPABASE_SERVICE_KEY`, `JWT_SECRET` 등)은 서버에만 둔다.

### 운영 필수 변수 (2026-08-01~)

서버 `backend/.env`에 아래가 반드시 있어야 한다. **`APP_ENV=production`이 기준점**이라
이 값이 없으면 나머지 가드가 전부 동작하지 않는다(미설정 시 `local`로 간주).

| 변수 | 없거나 예시값이면 |
|---|---|
| `APP_ENV=production` | 아래 가드가 동작하지 않고, 인증 없는 `/api/dev`가 외부에 노출된다 |
| `JWT_SECRET` | **기동 실패.** 공개된 예시값으로 서명하면 학생 토큰 위조 가능 |
| `JWT_CARD_SHARE_SECRET` | **기동 실패.** 카드 공유 링크 위조 가능 |
| `ADMIN_PASSWORD` | **기동 실패.** 관리자 API(회원 조회·삭제) 무단 접근 가능 |
| `OPERATOR_PASSWORD` | **기동 실패.** 운영진 콘솔(회원 목록·부스 확인) 무단 접근 가능 |
| `FRONTEND_ORIGIN` | **기동 실패.** 부스 QR 링크(`https://i-be.vercel.app`)의 base — localhost가 박힌 QR 인쇄물은 되돌릴 수 없다 |

> `OPERATOR_PASSWORD`는 `APP_ENV=production`에서 필수다. 서버 `backend/.env`에
> 넣기 전에 `production`으로 머지하면 앱 기동이 실패한다. `backend/**` 변경은
> push 즉시 자동 재배포되므로 순서를 지킨다.
> 1. 서버 `backend/.env`에 `OPERATOR_PASSWORD=...` 추가
> 2. PR을 `production`에 머지
> 3. `https://api.cnu-likelion.kr/healthz` 확인

`APP_ENV=production`인데 위 시크릿이 예시값이거나 비어 있으면 앱이 기동을 거부하고,
CD 워크플로의 헬스체크가 실패해 배포가 빨간불로 끝난다. 조용히 뜨는 것보다 안전하다.

**적용 순서에 주의한다.** `app = create_app()`은 모듈 임포트 시점에 실행되므로, 위 변수가
비어 있으면 `docker compose up -d --build app`이 방금 교체한 컨테이너가 뜨자마자
재시작을 반복한다(healthcheck 실패). CD 워크플로는 실패해도 이전 컨테이너로 되돌리는
롤백 단계가 없다 — 그래서 부스 기능만이 아니라 **API 전체가** 사람이 SSH로 들어가 고칠
때까지 죽는다. 따라서 **`FRONTEND_ORIGIN`(및 위 표의 다른 필수 변수)은 `production` 머지
전에 서버 `backend/.env`에 먼저 넣어둬야 한다** — 그 값을 요구하는 코드가 배포되는 시점에는
이미 서버에 값이 있어야 한다.

**배포 전 서버에서 확인**
```bash
cd <DEPLOY_PATH>/backend
grep -E '^(APP_ENV|JWT_SECRET|JWT_CARD_SHARE_SECRET|ADMIN_PASSWORD|OPERATOR_PASSWORD|FRONTEND_ORIGIN)=' .env
# 값이 change-me-* 이거나 줄이 없으면 교체:  openssl rand -hex 32
```

---

## DB 마이그레이션

- 파일 위치: `backend/supabase/migrations/*.sql` (순번 접두사, 예: `0007_create_booths.sql`).
- **CI·CD가 마이그레이션을 자동 적용하지 않는다.** 사람이 SQL을 직접 실행해 반영한다
  (예: Supabase 대시보드의 SQL Editor에 파일 내용을 붙여넣어 실행). 저장소에
  `supabase/config.toml`이 없어 `supabase db push` 같은 CLI 파이프라인도 연결돼 있지 않다.
- **코드 배포보다 먼저 적용한다.** 새 테이블·컬럼을 참조하는 코드가 먼저 배포되면 해당 API가
  `asyncpg.UndefinedTableError`(또는 컬럼 누락)로 처리되지 않은 예외를 던져 500이 나고,
  화면에는 원인을 알 수 없는 "요청을 처리하지 못했어요."만 보인다.
- 순서: **새 마이그레이션 SQL 실행 → 반영 확인 → 해당 코드를 `production`에 머지(배포)**.

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-07-01 | 배포 가이드 v1 — 현재 존재하는 백엔드 Docker 구성만 |
| 2026-07-02 | 백엔드 CD 자동 배포(GitHub Actions + SSH) 추가 |
| 2026-08-01 | 운영 시크릿 가드 추가 — `APP_ENV=production`에서 `JWT_SECRET`·`JWT_CARD_SHARE_SECRET`·`ADMIN_PASSWORD`가 예시값/빈 값이면 기동 실패. `/api/dev`는 `APP_ENV=local`에서만 등록 |
| 2026-08-01 | CD에 품질 게이트 추가 — 배포 전 `ruff`·`mypy`·`pytest`를 돌리고 실패 시 배포 중단. production 대상 PR에서도 검증 |
| 2026-08-02 | 운영 필수 변수에 `FRONTEND_ORIGIN` 추가 — 부스 QR 링크의 base라 `APP_ENV=production`에서 미설정(localhost 기본값)이면 기동 실패 |
| 2026-08-02 | 운영 필수 변수 절에 적용 순서 명시 — 필수 변수는 `production` 머지 전에 서버 `.env`에 먼저 있어야 하며, 누락 시 재시작 루프로 API 전체가 내려가고 CD에 롤백 단계가 없음을 기록 |
| 2026-08-02 | `## DB 마이그레이션` 절 추가 — 마이그레이션 파일 위치, 수동 적용 방식, 코드 배포보다 먼저 적용해야 하는 이유 정리 |
| 2026-08-08 | 운영진 콘솔 추가 — `OPERATOR_PASSWORD` 환경변수 필수화 |
