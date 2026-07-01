# 사진 → 인물 생성 dev 도구 (AI 모델 선택) — 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-06-22 |
| 상태 | 확정 (구현 대기) |
| 범위 | `backend` 이미지 모델 요청별 오버라이드 + `frontend` 새 dev 인물 도구 |
| 관련 문서 | [`2026-06-21-persona-card-image-pipeline-design.md`](2026-06-21-persona-card-image-pipeline-design.md) |

---

## 1. 목적과 범위

dev 환경에 **사진 → 인물(portrait) 이미지 생성 전용 도구**를 추가한다.
사용자가 **사진 1장 + 프롬프트 + AI 모델**을 선택해 인물 이미지 한 장을 생성·확인한다.
모델별 결과를 손쉽게 비교(모델만 바꿔 재생성)하는 것이 핵심.

핵심 신규 기능은 **이미지 모델을 요청 단위로 오버라이드**하는 것 하나뿐이며,
나머지는 기존 `AIClient.edit_image`/`generate_image`와 OpenRouter 호출 경로를 그대로 재사용한다.

### 1.1 확정 결정 (브레인스토밍)

| 항목 | 결정 |
|---|---|
| 위치 | **새 dev 도구** `/dev/photo-portrait` (인물 전용) |
| 출력 | **인물 이미지 1장만** (배경·카드 합성 없음) |
| 모델 선택 | **프리셋 드롭다운 + 직접 입력** |
| 비교 방식 | **한 번에 하나** (모델 바꿔가며 수동 비교) |
| 고급 설정 | strength·size·비율 **기본값 고정** (UI 비노출) |
| 사진 | **필수** (없으면 생성 불가) |
| 프롬프트 | 기존 카드 흐름의 인물 프롬프트를 **기본값으로 채우고 편집 가능** |

### 1.2 범위 제외

- 배경 이미지·카드 합성 (인물만)
- 다중 모델 동시 비교 / 그리드
- strength·size·aspect UI 노출
- DB / Storage 저장 (base64 반환만)
- 운영 흐름(persona-card) 변경

---

## 2. 사용자 흐름

```
[프론트 — /dev/photo-portrait]
1. 사진 업로드 (필수, 드래그/클릭)
2. 모델 선택 (프리셋 드롭다운 또는 "직접 입력")
3. 프롬프트 확인/편집 (기존 인물 프롬프트가 기본값)
        │
        ▼  POST /api/dev/portrait { prompt, photo_base64, model? }
[백엔드 — real]
4. photo + prompt → edit_image(PORTRAIT_IMAGE, model 오버라이드)  (OpenRouter)
        │
        ▼
5. { image_base64, model, size, elapsed } → 인물 이미지 1장 표시 + 다운로드
```

---

## 3. 백엔드 설계

### 3.1 `AIClient` — 모델 요청별 오버라이드 (재사용 코어)

| 파일 | 변경 |
|---|---|
| `app/adapters/ai_client.py` | `generate_image`·`edit_image`에 `model: str | None = None` 추가; `_image_payload`에 `model` 전달 |

- `_image_payload(..., model: str | None = None)` → 페이로드 `"model": model or self._image_model`.
- 기본값이 `None`이라 **기존 호출(파이프라인·워커)은 영향 없음** — 운영 코드에 안전하게 흡수되는 변경.
- 세마포어·지수 백오프 재시도·`inspect_image` 검증은 그대로.

### 3.2 새 엔드포인트 `POST /api/dev/portrait`

`app/routers/dev.py`에 얇은 동기 래퍼 추가.

```
POST /api/dev/portrait
body: {
  prompt: string (1~4000),
  photo_base64: string,          # 필수
  model?: string,                # 미지정 시 settings.ai_image_model
}
→ 200 {
  image_base64: string,          # 인물 PNG base64
  size_bytes: int,
  width: int, height: int,
  elapsed_seconds: float,
  model: string,                 # 실제 사용 모델 (model or settings.ai_image_model)
}
```

- 동작: `photo = b64decode(photo_base64)` →
  `ai.edit_image(AIPurpose.PORTRAIT_IMAGE, prompt, photo, size=PORTRAIT_SIZE, model=model)`.
- size는 `PORTRAIT_SIZE = "1024x1536"`(2:3) 고정.
- 응답 `model`은 프론트에 "어떤 모델이었는지" 표시·다운로드 파일명 용도.
- 기존 `/api/dev/image`·`/card`·`/persona-card`는 유지(하위 호환).

### 3.3 스키마 (`app/schemas/dev.py`)

- `GeneratePortraitRequest { prompt, photo_base64, model? }` — `photo_base64`는 필수(`min_length=1`).
- `GeneratePortraitResponse { image_base64, size_bytes, width, height, elapsed_seconds, model }`.

---

## 4. 프론트엔드 설계 (`/dev/photo-portrait/page.tsx`, client)

### 4.1 구성

| 요소 | 내용 |
|---|---|
| 사진 업로드 | 드래그/클릭 (`/dev/flow`의 `fileToBase64`·드롭존 패턴 재사용). **필수** — 없으면 생성 버튼 비활성 |
| 모델 선택 | shadcn `Select` 프리셋 + "직접 입력" 선택 시 `Input` 노출 |
| 프롬프트 | `Textarea`, 기본값 = 기존 인물 프롬프트(아래 4.3), 편집 가능 |
| 생성 버튼 | `POST /api/dev/portrait` 호출, 로딩/에러 처리 |
| 결과 | 인물 이미지(2:3) 표시 + 메타(모델/크기/시간) + PNG 다운로드 |

### 4.2 모델 프리셋

- 기본(미지정 → 서버 기본값), `google/gemini-3.1-flash-image-preview`,
  `google/gemini-2.5-flash-image-preview`, + "직접 입력".
- **정확한 프리셋 ID·동작은 구현 시 실제 호출로 확인 후 확정** (OpenRouter `/chat/completions` +
  `modalities` 이미지 경로를 지원하는 모델만 프리셋에 둔다).
- "직접 입력"은 검증 없이 그대로 전송 — 잘못된 ID는 OpenRouter 4xx가 에러로 노출(실험 의도).

### 4.3 기본 프롬프트

기존 카드 흐름의 인물 프롬프트(결정적 폴백 템플릿, `core/prompts/image_prompt.fallback_prompts`의
`portrait_prompt`)를 프론트 상수로 복사해 기본값으로 채운다:

> Photorealistic portrait of the same person from the photo, depicted at exactly 28 years old — an
> attractive, good-looking young adult with smooth clear skin, no wrinkles, no gray hair, stylish and
> polished, naturally beautiful/handsome, keeping their real facial identity, nice everyday adult
> attire, soft flattering lighting, 2:3 ratio, lifelike, no text or watermark.

### 4.4 `/dev` 인덱스

`app/dev/page.tsx`의 `DEV_TOOLS`에 카드 1개 추가 (title "사진 → 인물 생성", href `/dev/photo-portrait`,
tag "이미지", status "active").

---

## 5. 데이터 흐름

```
사진+프롬프트+모델
  → POST /api/dev/portrait
  → AIClient.edit_image(PORTRAIT_IMAGE, prompt, photo, model 오버라이드)
  → OpenRouter /chat/completions (modalities + image_url)
  → bytes → base64 → 화면 표시 + 다운로드
```

---

## 6. 에러 처리

- 기존 정책 유지: 일시 실패(타임아웃·429·5xx·손상) 지수 백오프 재시도, 소진 시 `ExternalServiceError`.
- 4xx(429 제외)·키 미설정 → 즉시 `ExternalServiceError`.
- 잘못된 모델 ID → OpenRouter 4xx → 에러 메시지 그대로 노출 (직접 입력 실험 위해 의도적).
- 프론트는 `error.message`(+details) 표시 — 기존 `image-test` 패턴 재사용.

---

## 7. 테스트

| 대상 | 방식 |
|---|---|
| `AIClient.generate_image`/`edit_image` model 오버라이드 | `httpx.MockTransport`로 전송 payload의 `model` 필드가 오버라이드/기본값으로 채워지는지 검증 |
| 기존 이미지 클라이언트 테스트 | 회귀 — `model` 인자 추가 후에도 통과 |
| `POST /api/dev/portrait` | photo 디코드 → `edit_image` 호출 + `model` echo 응답 (AI stub) |

---

## 8. 작업 순서

1. 백엔드: `AIClient` model 오버라이드 → 스키마 → `/api/dev/portrait` 엔드포인트
2. 백엔드 테스트 (payload model 검증 + 엔드포인트)
3. 프리셋 모델 ID 실제 호출 확인 → 확정
4. 프론트: `/dev/photo-portrait` 페이지 + 모델 Select + 기본 프롬프트 + 결과/다운로드
5. `/dev` 인덱스 카드 추가
6. 엔드투엔드 클릭 테스트 (사진 업로드 → 모델 선택 → 인물 생성)

---

## 9. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-06-22 | 초안 — 사진→인물 생성 dev 도구 + 이미지 모델 요청별 선택 설계 확정 |
</content>
</invoke>
