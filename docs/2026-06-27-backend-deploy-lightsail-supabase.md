# 백엔드 배포 가이드 — AWS Lightsail + Supabase

| 항목 | 값 |
|---|---|
| 작성일 | 2026-06-27 |
| 상태 | Draft — 실배포 전 합의/검증 |
| 적용 대상 | `backend` 레포 (FastAPI) |
| 관련 문서 | `docs/backend-design.md`, `회의정리_진로교육카드프로젝트.md` |

> FastAPI 백엔드(앱 + 카드 생성 워커)를 **AWS Lightsail 인스턴스**에 Docker로 배포하고, **DB·스토리지는 Supabase**를 사용한다. AI는 OpenRouter. 프론트는 별도(추후).

---

## 0. 한눈에 보기

```
                 HTTPS(443)
[사용자/프론트] ───────────────> [ Lightsail 인스턴스 (Ubuntu) ]
                                   ├─ Caddy (리버스 프록시, 자동 HTTPS)
                                   └─ FastAPI 컨테이너 :8000 (앱 + 인-프로세스 워커)
                                            │
                          ┌─────────────────┼───────────────────┐
                          ▼                                      ▼
                 [ Supabase ]                            [ OpenRouter ]
                  Postgres :5432 (직접연결, IPv6)          chat + image 생성
                  Storage (photos / cards)
```

- **Lightsail가 하는 일**: HTTP 오케스트레이션(I/O 바운드). 무거운 연산(LLM·이미지)은 OpenRouter, 데이터·파일은 Supabase에 위임.
- **선정 사양**: General purpose · **Dual-stack** · 2GB RAM · 2 vCPU · 60GB SSD · 3TB 전송 — 1차 ~1,000명 규모에 충분(근거: `backend-design.md §9.4`, 본 프로젝트는 배치 생성 방식).
- **Dual-stack(IPv6) 중요**: Supabase 직접 연결(`db.<ref>.supabase.co:5432`)은 IPv6 경로를 쓰므로 이 인스턴스에서 바로 접속 가능.

---

## 1. 사전 준비물

| 항목 | 비고 |
|---|---|
| AWS 계정 | Lightsail 사용 |
| Supabase 계정 + 프로젝트 | Postgres + Storage |
| OpenRouter 계정 + API 키 | chat + image |
| 도메인 1개 | 예: `api.ibe.example.com` (HTTPS 발급용) |
| GitHub 저장소 접근 | 배포 자동화(SSH) |
| 로컬: Docker, git | 사전 동작 확인용 |

---

## 2. Supabase 설정

### 2.1 프로젝트 생성
1. Supabase 콘솔에서 프로젝트 생성(리전: **가까운 곳**, 예 `ap-northeast-2 Seoul`).
2. DB 비밀번호 설정(생성 시 1회) → 안전하게 보관.

### 2.2 스키마 / 마이그레이션
- `backend-design.md §6`의 스키마 4개(`pii`, `generated`, `rewards`, `ops`)와 테이블을 마이그레이션으로 생성.
- 방법: Supabase CLI(`supabase db push`) 또는 SQL 에디터로 초기 마이그레이션 실행.
- (RLS 정책은 §6.4 권한 매트릭스 기준으로 추후 적용)

### 2.3 Storage 버킷
- `photos` (private) · `cards` (signed URL) 두 버킷 생성.
- 앱은 `SUPABASE_SERVICE_KEY`로 업로드, 외부 노출은 **Signed URL로만**.

### 2.4 연결 문자열 (중요)

**기본: 직접 연결(Direct connection, 포트 5432)** 을 사용한다.

```
postgresql://postgres:<DB_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres
```

이유: 이 앱은 **상시 워커 + `SELECT ... FOR UPDATE SKIP LOCKED` + asyncpg prepared statement + 영속 커넥션 풀**을 쓴다. 트랜잭션 풀러(`:6543`)는 prepared statement와 충돌(asyncpg는 `statement_cache_size=0` 필요)하고 세션 기능이 제한되므로 단일 상시 인스턴스에는 직접 연결이 맞다.

- Dual-stack 인스턴스라 직접 연결(IPv6) 가능.
- 만약 IPv6 경로 문제가 생기면 **Session-mode 풀러**로 폴백(이건 prepared statement 지원). **Transaction-mode(`:6543`)는 피한다.**
- asyncpg 풀 크기는 `CARD_WORKER_CONCURRENCY`(기본 10) + API 핸들러 여유를 고려해 **10~20** 사이로 제한(Supabase Free/Pro의 연결 한도 확인).

---

## 3. 운영용 환경변수 (.env)

`backend/.env.example`를 기준으로 운영값을 채운다. 핵심만:

```env
# App
APP_ENV=production
APP_BASE_URL=https://api.ibe.example.com
FRONTEND_ORIGIN=https://ibe.example.com   # 프론트 붙으면 정확히
LOG_LEVEL=INFO

# DB (Supabase 직접 연결)
DATABASE_ENABLED=true
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@db.<ref>.supabase.co:5432/postgres

# Storage (Supabase)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>   # 절대 외부 노출 금지
STORAGE_BUCKET_PHOTOS=photos
STORAGE_BUCKET_CARDS=cards

# Auth (강한 랜덤값으로 교체)
JWT_SECRET=<openssl rand -hex 32>
JWT_CARD_SHARE_SECRET=<openssl rand -hex 32>
JWT_ISSUER=ibe

# AI (OpenRouter)
AI_CHAT_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=<openrouter-key>
AI_IMAGE_API_URL=https://openrouter.ai/api/v1/chat/completions
AI_IMAGE_MODEL=google/gemini-3.1-flash-image-preview

# Worker (2GB 메모리 기준 안전선)
CARD_WORKER_ENABLED=true
CARD_WORKER_CONCURRENCY=10     # 메모리 빠듯하면 8로
IMAGE_CONCURRENCY=10
JOB_POLL_INTERVAL_SECONDS=1
JOB_MAX_RETRIES=2
JOB_STUCK_TIMEOUT_MINUTES=10
```

> 시크릿 생성: `openssl rand -hex 32`. `.env`는 **절대 git에 커밋 금지**(`.gitignore` 확인).

---

## 4. Lightsail 인스턴스 생성

1. Lightsail 콘솔 → **Create instance**
2. 리전/AZ: 서울(`ap-northeast-2`)
3. 플랫폼: **Linux/Unix**, 블루프린트: **Ubuntu 22.04 LTS** (OS only)
4. **네트워킹: Dual-stack(IPv4+IPv6)** 선택 — Supabase 직접 연결(IPv6)에 필요
5. 플랜: **2GB RAM / 2 vCPU / 60GB SSD / 3TB** (선정 사양)
6. 인스턴스 이름: `ibe-backend-prod`
7. 생성 후 **고정 IP(Static IP)** 할당 → 도메인 A 레코드에 사용

### 4.1 방화벽(Lightsail Networking 탭)
| 포트 | 용도 | 비고 |
|---|---|---|
| 22 (SSH) | 관리 | **내 IP만** 허용으로 제한 권장 |
| 80 (HTTP) | Caddy ACM 챌린지/리다이렉트 | 공개 |
| 443 (HTTPS) | 서비스 | 공개 |

> 앱 포트 **8000은 외부에 열지 않는다.** Caddy가 내부에서만 프록시.

---

## 5. 인스턴스 초기 셋업 (SSH 접속 후)

```bash
# 1) 패키지 최신화
sudo apt-get update && sudo apt-get upgrade -y

# 2) Docker + compose plugin
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # 재로그인 후 sudo 없이 docker 사용

# 3) (2GB 메모리 안전판) 스왑 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 6. 코드 배포 + 운영용 Compose

로컬 개발용 `docker-compose.yml`은 **로컬 postgres(db 서비스)** 를 포함한다. 운영에선 **DB가 Supabase**이므로 db 서비스를 빼고 **앱 + Caddy**만 띄우는 override를 둔다.

`backend/compose.prod.yml` (신규):
```yaml
services:
  app:
    build:
      context: .
    env_file:
      - .env
    restart: unless-stopped
    expose:
      - "8000"            # 외부 publish 안 함. Caddy만 접근
    # 로컬 db 의존성 제거 (Supabase 사용)

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - app

volumes:
  caddy-data:
  caddy-config:
```

`backend/Caddyfile` (신규):
```
api.ibe.example.com {
    reverse_proxy app:8000
}
```
> Caddy가 Let's Encrypt 인증서를 **자동 발급/갱신**한다(80/443 열려 있어야 함).

배포:
```bash
# 인스턴스에서
git clone <repo-url> ibe && cd ibe/backend
# .env 작성 (3장 값) — 안전하게 업로드, git 커밋 금지
nano .env
# 빌드 + 기동
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build app caddy
```

> 또는 운영 전용 파일만 쓰려면 `docker compose -f compose.prod.yml up -d --build` (위 override가 app 빌드 컨텍스트를 포함하므로 단독 사용 가능).

---

## 7. 도메인 연결 + 기동 확인

1. 도메인 DNS에 A 레코드: `api.ibe.example.com → <Lightsail 고정 IP>` (Dual-stack이면 AAAA(IPv6)도 함께 권장)
2. 전파 후 Caddy가 자동으로 HTTPS 발급
3. 헬스체크:
```bash
curl https://api.ibe.example.com/healthz   # 200 기대 (엔드포인트명은 앱 구현 확인)
docker compose -f docker-compose.yml -f compose.prod.yml logs -f app
```

---

## 8. CI/CD (GitHub Actions → SSH 배포)

가장 단순한 형태: main 푸시 시 인스턴스에 SSH로 들어가 `git pull` + 재빌드.

`.github/workflows/deploy.yml` (개념):
```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.LIGHTSAIL_HOST }}
          username: ubuntu
          key: ${{ secrets.LIGHTSAIL_SSH_KEY }}
          script: |
            cd ~/ibe/backend
            git pull
            docker compose -f docker-compose.yml -f compose.prod.yml up -d --build app
            docker image prune -f
```
- GitHub Secrets: `LIGHTSAIL_HOST`(고정 IP), `LIGHTSAIL_SSH_KEY`(인스턴스 키).
- 더 견고하게: ECR 대신 GHCR로 이미지 빌드/푸시 후 인스턴스에서 pull 하는 방식으로 확장 가능(빌드를 인스턴스에서 안 함 → 메모리 여유).

> **메모리 팁**: 2GB에서 인스턴스 내 빌드가 빠듯하면, GitHub Actions에서 이미지를 빌드해 **GHCR에 push**하고 인스턴스는 `docker compose pull`만 하게 바꾼다.

---

## 9. 운영

### 9.1 로그 / 모니터링
- 앱 로그: `docker compose ... logs -f app` (구조화 JSON, `backend-design.md §13`).
- 리소스: `docker stats`, `htop`(설치), `free -h`(스왑 사용 확인).
- 큐 상태: 관리자 대시보드 또는 `ops.jobs` 직접 조회로 큐 길이 모니터.

### 9.2 백업
- **Supabase**: DB는 Supabase 백업 정책(Pro면 PITR) 사용 — 진짜 데이터는 여기 있음.
- **Lightsail 스냅샷**: 인스턴스 자동 스냅샷 활성화(설정 변경 보존). 단, 상태는 대부분 Supabase에 있으므로 인스턴스는 재구축 가능.

### 9.3 행사 대비 스케일업 (회의 §1: 7월 말 일괄 생성 / 10월 행사)
- 배치 생성을 몰아칠 때만 일시적으로 큰 플랜으로: **스냅샷 → 더 큰 플랜으로 새 인스턴스 생성 → 고정 IP 재할당**.
- 또는 `CARD_WORKER_CONCURRENCY`/`IMAGE_CONCURRENCY`를 조정(메모리·OpenRouter rate limit 한도 내).
- 진짜 상한은 **OpenRouter 이미지 rate limit**(§9.4) — 사전에 한도 확인/상향 요청.
- 행사 후: 작은 플랜으로 복귀(비용 절감).

---

## 10. 보안 체크리스트
- [ ] SSH 22번 포트 **내 IP만** 허용
- [ ] 앱 8000 포트 외부 비공개(Caddy만 접근)
- [ ] `.env` git 미커밋, 권한 `chmod 600`
- [ ] `JWT_SECRET`/`JWT_CARD_SHARE_SECRET` 강한 랜덤값
- [ ] `SUPABASE_SERVICE_KEY` 노출 금지(서버에만)
- [ ] CORS: `FRONTEND_ORIGIN`만 허용
- [ ] Storage 접근은 Signed URL만, 이미지 인스턴스 프록시 금지
- [ ] HTTPS 강제(Caddy 기본), HSTS 검토

---

## 11. 트러블슈팅
| 증상 | 점검 |
|---|---|
| DB 연결 실패 | IPv6 경로 확인(`ping6 db.<ref>.supabase.co`), 직접연결 문자열, 비밀번호. 안되면 Session 풀러로 폴백 |
| `prepared statement` 오류 | 트랜잭션 풀러(:6543) 쓰는 중 → 직접연결/Session 풀러로 변경 |
| 메모리 부족(OOM) | `CARD_WORKER_CONCURRENCY`/`IMAGE_CONCURRENCY` 낮추기, 스왑 확인, 빌드는 GHCR로 외부화 |
| HTTPS 발급 실패 | 80/443 방화벽, 도메인 A레코드, Caddy 로그 |
| 카드 생성 멈춤 | 워커 살아있는지(`CARD_WORKER_ENABLED=true`), `ops.jobs` stuck 회수, OpenRouter 429 |

---

## 12. 비용 가늠 (월, 대략)
| 항목 | 예상 |
|---|---|
| Lightsail 2GB 인스턴스 | 고정 (선정 플랜) |
| Supabase | Free로 시작 가능, 행사기 Pro 검토 |
| OpenRouter | 사용량 기반(카드 수 × 모델 단가) — 비용 추적 로깅(§13) |
| 도메인 | 연 단위 |

> 평시 작은 구성 유지 → 배치/행사 시점만 일시 상향이 핵심 절감 전략.

---

## 13. 진행 순서 요약(체크리스트)
1. [ ] Supabase 프로젝트 + 스키마 마이그레이션 + 버킷 2개
2. [ ] 로컬 docker-compose로 FastAPI ↔ Supabase 직접연결 검증
3. [ ] Lightsail 인스턴스(Dual-stack) 생성 + 고정 IP + 방화벽
4. [ ] Docker/스왑 셋업
5. [ ] `compose.prod.yml` + `Caddyfile` 추가, `.env` 작성
6. [ ] 도메인 연결 → HTTPS 발급 → `/healthz` 확인
7. [ ] GitHub Actions 배포 자동화
8. [ ] 부하/메모리 테스트(행사 전 1회)
9. [ ] 백업/스냅샷 + 보안 체크리스트

---

## 14. 변경 이력
| 날짜 | 작성 | 변경 |
|---|---|---|
| 2026-06-27 | 초안 | Lightsail + Supabase 백엔드 배포 가이드 v1 |
