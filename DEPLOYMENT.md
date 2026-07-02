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
2. Actions가 서버 SSH 접속 → `git reset --hard origin/production`
3. `docker compose ... up -d --build app` + `docker image prune -f`
4. `https://api.cnu-likelion.kr/healthz` 헬스체크로 배포 성공 검증

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

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-07-01 | 배포 가이드 v1 — 현재 존재하는 백엔드 Docker 구성만 |
| 2026-07-02 | 백엔드 CD 자동 배포(GitHub Actions + SSH) 추가 |
