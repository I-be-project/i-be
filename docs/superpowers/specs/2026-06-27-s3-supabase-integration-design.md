# S3 스토리지 + Supabase DB 적용 — 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-06-27 |
| 상태 | 확정 (구현 대기) |
| 적용 대상 | `backend` (FastAPI) |
| 관련 문서 | `docs/backend-design.md`, `docs/2026-06-27-backend-deploy-lightsail-supabase.md` |

> 목표: 기존 백엔드의 **DB를 Supabase(관리형 Postgres) 직접 연결**로 붙이고, **이미지 저장을 단일 비공개 S3 버킷**으로 구현한다. 세부 전달 최적화(CloudFront 등)는 범위 밖.

---

## 1. 배경 / 현재 상태

- **DB**: `app/adapters/db_pool.py`의 `DBPool`은 asyncpg `database_url`만 받는 일반 Postgres 풀. → Supabase 적용은 **연결 문자열 교체 + 마이그레이션 실행**으로 충분, 코드 변경 없음.
- **Storage**: `app/adapters/storage_client.py`는 **완전 스텁**(모든 메서드 `NotImplementedError`)이고, 앱 내 **호출처가 아직 없음**. → S3 어댑터를 처음부터 구현하면 됨. 인터페이스(`upload_*` / `create_signed_url` / `delete`)는 이미 스토리지 중립적으로 잡혀 있음.
- 배포는 Lightsail(AWS) + Supabase 구성(별도 문서). Lightsail은 **인스턴스 IAM 역할 미지원**이라 S3 인증은 액세스 키 방식이 현실적.

---

## 2. 결정 사항 (확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| DB | Supabase **직접 연결**(`:5432`) | 트랜잭션 풀러(`:6543`) 금지(asyncpg prepared statement 충돌). IPv6 불가 시 Session 풀러 폴백 |
| 이미지 저장소 | **단일 비공개 S3 버킷** + 프리픽스 | 퍼블릭 액세스 전부 차단 |
| S3 인증 | **IAM 사용자 액세스 키**를 `.env`에 | 우리 버킷의 `PutObject`/`GetObject`/`DeleteObject`만 허용(최소 권한) |
| 외부 노출 | **Presigned GET URL만** | 만료시간 포함. 퍼블릭 URL 미사용 |
| 사진 보관 | **3종 모두 영구 보관, 자동 폐기 없음** | 사용자 지시. `backend-design.md`의 "카드 생성 후 폐기/30일" 정책 **미적용**. 명시적 삭제 요청 시에만 삭제 |
| S3 클라이언트 | `aioboto3` | 앱이 async라 자연스러움 |
| 전달 최적화 | **범위 밖** | CloudFront/CDN, Presigned PUT 직접 업로드 제외(YAGNI) |

---

## 3. 저장 구조 — 단일 버킷 / 3 프리픽스

```
s3://<S3_BUCKET>/
  ├─ uploads/     ① 원본 사진   (학생 업로드 원본, PII)            — 영구 보관
  ├─ ai-images/   ② 생성된 사진 (AI 산출 인물 이미지, 합성 전)      — 영구 보관
  └─ cards/       ③ 카드 사진   (텍스트·QR 합성된 최종 카드)         — 영구 보관
```

- 버킷은 **"모든 퍼블릭 액세스 차단" 활성화**. 백엔드는 IAM 키로 인증 접근, 사용자는 Presigned URL로 접근(둘 다 퍼블릭 차단과 무관하게 동작).
- **DB에는 S3 객체 키(경로)만** 저장. 바이너리는 전부 S3.
- 객체 키 규칙(예): `uploads/{student_id}/{uuid}.jpg`, `ai-images/{card_id}/{uuid}.png`, `cards/{card_id}/{uuid}.png`. (구현 시 확정)

---

## 4. 이미지 흐름

### 4.1 받기 (사용자 → 백엔드 → S3)
1. 학생이 `/login`에서 닉네임 + 사진 업로드 → `POST /api/auth/register` (multipart/form-data).
2. 백엔드: `app/core/images.py:inspect_image`로 **유효 이미지 검증** → `StorageClient.upload_photo(bytes)` → `uploads/`에 `put_object`.
3. DB(`pii.students.photo_path`)에 **S3 키만** 저장. 업로드 동의 플래그는 그대로 수집(PII).

### 4.2 생성 (워커 → AI → S3)
1. 카드 생성 잡을 `card_worker`가 클레임.
2. `uploads/`에서 원본 사진 로드 → OpenRouter 이미지 생성(얼굴 유지 image-to-image).
3. **`StorageClient.upload_generated_image(bytes)`** → `ai-images/`에 put, 경로 DB 보관.
4. `app/services/card_renderer.py:render_card`로 페르소나 텍스트 + QR 합성 → 최종 카드 PNG.
5. `StorageClient.upload_card_image(bytes)` → `cards/`에 put, `cards.image_path`에 경로 저장.

> 사진/생성물/카드 모두 **삭제하지 않는다**(자동 폐기 경로 없음).

### 4.3 전달 (S3 → 사용자)
1. 사용자/공유자가 카드 페이지 진입(본인 토큰 또는 share token).
2. `GET /api/cards/{id}` → 백엔드가 DB에서 경로 조회 → `StorageClient.create_signed_url(key, ttl)`로 **Presigned GET URL** 발급.
3. 브라우저가 그 URL로 **S3에서 직접 다운로드**(백엔드 바이트 미경유 → Lightsail 대역폭·메모리 절약).
4. URL은 만료(공유링크 24h 등 설정값).

### 백엔드의 역할
파일 서버가 아니라 **관문**: 이미지 **검증** · **인증**(본인/공유 토큰) · **경로 관리**(DB엔 키만) · **Presigned URL 발급**. 무거운 다운로드는 S3가 담당. 업로드만 검증·생성 목적상 백엔드 통과.

---

## 5. 코드 변경 범위

### 5.1 `app/adapters/storage_client.py` — S3 어댑터로 재구현
- 의존: `aioboto3` 세션/클라이언트. 생성자는 `region`, `bucket`, 키 자격증명, 프리픽스 3종을 받음.
- 메서드:
  - `upload_photo(path, data, *, content_type) -> str` → `uploads/`에 `put_object`(SSE 적용, `ContentType` 지정). 객체 키 반환.
  - `upload_generated_image(path, data, *, content_type) -> str` **(신규 메서드)** → `ai-images/`.
  - `upload_card_image(path, data, *, content_type) -> str` → `cards/`.
  - `create_signed_url(key, *, ttl_seconds) -> str` → `generate_presigned_url('get_object', ...)`.
  - `delete(key) -> None` → `delete_object` (명시적 삭제 요청 경로 전용).
- `from_settings(settings)`를 S3 설정으로 갱신.
- 단일 버킷이므로 프리픽스로 분기. (구현 시 내부 헬퍼로 키 구성)

### 5.2 `app/config.py` `Settings`
- 추가: `aws_access_key_id: str`, `aws_secret_access_key: str`, `s3_region: str = "ap-northeast-2"`, `s3_bucket: str`.
- 프리픽스: `storage_prefix_uploads="uploads"`, `storage_prefix_ai_images="ai-images"`, `storage_prefix_cards="cards"` (기존 `storage_bucket_photos/cards`는 프리픽스 의미로 정리/대체).
- `supabase_url`/`supabase_service_key`는 **유지**하되 스토리지 용도 주석 제거(DB·Auth 맥락만).

### 5.3 `app/deps.py`
- `get_storage_client` → 갱신된 `StorageClient.from_settings(settings)` 사용(시그니처 변화 없음).

### 5.4 `backend/.env` / `backend/.env.example`
- 추가: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET`, 프리픽스 3종.
- `DATABASE_URL`을 Supabase 직접 연결 형식으로 안내(값은 운영자가 채움).
- 기존 Supabase Storage 변수(`STORAGE_BUCKET_*`) 정리.

### 5.5 `backend/pyproject.toml`
- `dependencies`에 `aioboto3` 추가 (→ `uv lock` 갱신).

### 5.6 DB
- 코드 변경 없음. `DATABASE_URL`만 Supabase 직접 연결로 교체 + `backend/supabase/migrations/` 스키마 반영(`supabase db push` 또는 SQL 에디터).

---

## 6. 인프라 셋업 (콘솔, 코드 외)

### 6.1 S3
- 단일 버킷 생성(리전 `ap-northeast-2`), **모든 퍼블릭 액세스 차단** 활성화.

### 6.2 IAM (최소 권한)
- 정책(우리 버킷만):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::<S3_BUCKET>/*"
  }]
}
```
- 프로그램용 IAM 사용자 생성 → 위 정책 부착 → **액세스 키 발급** → `.env`에 주입.

### 6.3 Supabase
- 프로젝트의 **Direct connection**(`:5432`) 문자열을 `DATABASE_URL`로. (ref: `ohsamobxhxlycnjrxkbb`)

---

## 7. 테스트

- **단위(어댑터)**: `aioboto3` 클라이언트를 목/스텁으로 대체해 `upload_*`가 올바른 버킷·키·content-type으로 `put_object`를 호출하는지, `create_signed_url`이 만료 인자를 전달하는지, `delete`가 키로 호출하는지 검증.
- **(선택) 통합**: `moto`(S3 모킹) 또는 실제 테스트 버킷으로 put → presigned GET 왕복 검증.
- **DB 연결 스모크**: 로컬 docker-compose에서 `DATABASE_URL`을 Supabase로 두고 헬스/간단 쿼리 1회.
- 기존 `app/core/images.py` 검증은 변경 없음(그대로 업로드 게이트로 사용).

---

## 8. 보안 체크리스트

- [ ] 버킷 "모든 퍼블릭 액세스 차단" 활성화
- [ ] IAM 정책 최소 권한(우리 버킷, 3개 액션만)
- [ ] `.env` git 미커밋(`chmod 600`), 키 secret은 채팅/코드에 미노출
- [ ] 외부 노출은 Presigned URL만(만료시간 포함), 퍼블릭 URL 미사용
- [ ] PII(원본 사진) 업로드 동의 수집 유지
- [ ] `DATABASE_URL`은 직접 연결(`:5432`), 트랜잭션 풀러(`:6543`) 미사용

---

## 9. 범위 밖 (YAGNI)

- CloudFront/CDN, Presigned PUT 직접 업로드, S3 라이프사이클 자동 삭제/만료, RLS 세부 정책, 멀티 버킷 분리.

---

## 10. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-06-27 | 초안 확정 — 단일 S3 버킷(3 프리픽스) + Supabase 직접 연결, 사진 3종 영구 보관 |
