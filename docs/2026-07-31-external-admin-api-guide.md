# 관리자 API 외부 개방 — 변경 기록 (2026-07-31)

외부 시스템이 학생 정보·사진을 받아갈 수 있도록 CORS를 열고, 수집 스크립트와 테스트를 추가한 내역.

**API 사용법은 [`2026-07-31-admin-api-usage.md`](2026-07-31-admin-api-usage.md)에 정리했다(외부 전달용).**
이 문서는 무엇을 왜 바꿨는지만 남긴다.

## 1. CORS 전 오리진 개방

### 이전

`backend/app/main.py`가 환경에 따라 분기했다.

- `APP_ENV=local` → `http://localhost:*`, `http://127.0.0.1:*` 정규식만 허용
- 그 외(staging·production) → `FRONTEND_ORIGIN` **단일 오리진**만 허용

외부 도메인의 브라우저 프런트에서 관리자 API를 호출하면 차단됐다.

### 이후

환경 분기를 없애고 설정 하나로 통일했다.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # 기본 ["*"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

| 설정 | 기본값 | 설명 |
|---|---|---|
| `CORS_ALLOW_ORIGINS` | `*` | 전 오리진 개방. 콤마로 나열하면 그 목록만 허용 |

```bash
# 좁히는 예 — 서버 backend/.env
CORS_ALLOW_ORIGINS=https://admin.example.com,https://partner.example.com
```

`Settings.cors_origin_list`가 콤마 구분 문자열을 파싱하고, 빈 값·공백만 들어오면 `["*"]`로 폴백한다.

### 짚어둘 점

- **`FRONTEND_ORIGIN`은 더 이상 CORS에 관여하지 않는다.** 설정 자체는 남아 있다.
- Starlette은 `"*"` + `allow_credentials=True` 조합에서 `Access-Control-Allow-Origin`에 와일드카드 대신
  **요청 Origin을 그대로 되돌려주고 `Vary: Origin`을 붙인다**(`starlette/middleware/cors.py`).
  "wildcard와 credentials는 함께 못 쓴다"는 통상의 제약에 걸리지 않고 `Authorization` 요청이 통과한다.
- CORS는 브라우저 전용 보호 장치다. 서버 사이드(curl·Python·Node) 호출은 이전에도 가능했다.
  이번 변경으로 달라진 것은 **브라우저에서 직접 호출할 수 있게 된 것**뿐이다.
- 남은 방어선은 관리자 계정 하나뿐이다. `ADMIN_PASSWORD`를 충분히 길게 두고, 유출이 의심되면
  비밀번호와 함께 `JWT_SECRET`도 교체한다(이미 발급된 토큰은 비밀번호만 바꿔서는 만료 전까지 유효하다).

## 2. 수집 스크립트

`backend/scripts/export_students.py` — 로그인부터 사진 저장·매니페스트 생성까지 처리하는 참조 구현.
서버 코드에 의존하지 않고 HTTP만 쓰므로 외부 시스템에 그대로 복사해도 동작한다.
사용법은 [사용 설명서 8절](2026-07-31-admin-api-usage.md#8-전체-수집-예제) 참조.

만료되는 `photo_url`은 매니페스트에 남기지 않고, 내려받은 로컬 상대경로를 `photo_file`에 기록한다.
테스트를 위해 `AdminClient(transport=...)`·`run(args, transport=...)`로 전송 계층을 주입할 수 있게 열어 뒀다.

## 3. 테스트

| 파일 | 검증 |
|---|---|
| `backend/tests/test_cors.py` | 임의 오리진 GET·preflight(`authorization`) 허용, `CORS_ALLOW_ORIGINS`로 좁히기, 빈 값 폴백 |
| `backend/tests/test_admin_export_flow.py` | 로그인 → 학교 목록 → 학교별 페이지네이션(누락·중복 없음) → 사진 URL → 상세, 무토큰 401 |
| `backend/tests/test_export_students_script.py` | 스크립트의 페이지네이션·사진 저장 경로·매니페스트·플래그·401·다운로드 실패 처리 |

## 4. 남은 과제

- `GET /api/admin/students`의 `limit`에 상한 검증이 없다(`admin.py`). 큰 값도 통과하며 학생 수만큼
  presigned URL을 순차 생성해 응답이 느려진다. `Query(le=200)` 등으로 제한하는 편이 안전하다.
- 진행 상태(`progress.has_card` 등) 기준 서버 측 필터가 없어 클라이언트가 전량 받아 걸러야 한다.
- 관리자 계정이 단일 공유 계정이라 감사 추적(누가 언제 무엇을 조회했는지)이 남지 않는다.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-31 | 최초 작성. CORS 전 오리진 개방(`CORS_ALLOW_ORIGINS` 신설), 수집 스크립트·테스트 추가 |
