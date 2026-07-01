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

**재배포 (코드 갱신 후)**
```bash
cd backend
git pull
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build app
docker image prune -f
```

**상태 확인**
```bash
docker compose -f docker-compose.yml -f compose.prod.yml logs -f app
curl https://api.cnu-likelion.kr/healthz
```

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
