# 페르소나 카드 이미지 생성 파이프라인 — 설계 (dev 단계)

| 항목 | 값 |
|---|---|
| 작성일 | 2026-06-21 |
| 상태 | 확정 (구현 대기) |
| 범위 | `backend` 실제 이미지 생성 코어 + `frontend` dev 흐름 |
| 관련 문서 | [`../../backend-design.md`](../../backend-design.md) §7 AI 오케스트레이션 |

---

## 1. 목적과 범위

페르소나 카드 **생성 파이프라인을 dev 환경에서 엔드투엔드로 완성**한다.
이번 작업물이 곧 운영 카드-잡 코어(저장만 제외)가 되도록, 버려지는 코드 없이 재사용 가능한 서비스 레이어로 만든다.

### 1.1 real / mock 경계

| 단계 | 처리 |
|---|---|
| Q1~6 (고정 질문) | **mock** — 프론트 프리셋 |
| Q7~9 (적응형 질문 생성, AI-02) | **mock** — 프론트 프리셋 |
| Q7~9 답변 | **mock** — 프론트 프리셋 |
| Q10 = 페르소나 후보 3개 중 선택 | **mock 후보** — 프론트에서 1개 클릭 선택 |
| 선택된 페르소나 (name/tagline/keywords/fields) | **mock** — 선택된 후보 객체 |
| **AI-05 이미지 프롬프트 생성** | **real** ✅ |
| **IMG-01 인물 이미지 (얼굴 입력)** | **real** ✅ |
| **IMG-02 배경 이미지** | **real** ✅ |
| **카드 합성 (Pillow + QR)** | **real** ✅ (기존 렌더러 재사용) |

### 1.2 이번 범위에서 제외

- DB / Supabase Storage 저장 (카드는 base64로 반환만)
- 인증·세션·잡 큐·워커 연결 (동기 호출로 검증)
- 페르소나 텍스트 생성(AI-04)·질문 생성(AI-02) — 모두 mock
- 추천 부스(recommendedBooths)

---

## 2. 확정된 사용자 흐름

```
[프론트 dev — mock + 버튼 전환]
0. 사진 업로드 (기본 샘플 내장 → 클릭만으로도 진행 가능)
1. Q1~6  (mock 질문+답변 표시)      → [다음]
2. Q7 → [다음]   3. Q8 → [다음]   4. Q9 → [다음]
5. Q10 = 페르소나 후보 3개 중 1개 클릭 선택   ← 유일한 실질 선택
        │
        ▼  POST /api/dev/persona-card { persona, photo_base64?, qr_data? }
[백엔드 — real]
6. AI-05 이미지 프롬프트 생성 (persona → portrait_prompt, background_prompt)
7. IMG-01 얼굴기반 인물(image-edit)  ‖  IMG-02 배경(text→image)   ← 병렬
8. 카드 합성 (render_card: 배경+인물+텍스트+QR)
        │
        ▼
9. { persona, card_base64, timings } → 프론트가 완성 카드 표시
```

모든 답변은 `frontend/lib/mock`에 프리셋. 각 페이지는 "다음" 버튼만으로 전환(실입력 위젯 없음).

---

## 3. 백엔드 설계

### 3.1 신규/변경 컴포넌트

| 파일 | 변경 | 책임 |
|---|---|---|
| `app/adapters/ai_client.py` | **추가** `edit_image()` | 얼굴 입력용 image-edit 호출(multipart). `generate_image`와 동일한 재시도·검증 하드닝 |
| `app/config.py` | **추가** `ai_image_edit_api_url`, (필요 시) portrait 전용 provider 설정 | edits 엔드포인트 분기 |
| `app/services/ai_service.py` | **구현** `generate_image_prompts()` | AI-05. chat 호출 + JSON 파싱 + 검증 + 폴백 |
| `app/services/persona_pipeline.py` | **신규** | persona(+photo) → 프롬프트 → 이미지 2장 → 카드. 오케스트레이터 |
| `app/core/prompts/image_prompt.py` | **신규** | AI-05 system/user 프롬프트 템플릿 + 입력 dataclass |
| `app/schemas/dev.py` | **추가** | `PersonaInput`, `GeneratePersonaCardRequest/Response` |
| `app/routers/dev.py` | **추가** `POST /api/dev/persona-card` | 위 파이프라인의 얇은 동기 래퍼 |

기존 `generate_card_images`, `card_renderer.render_card`, `core/images.inspect_image`는 **그대로 재사용**.

### 3.2 `AIClient.edit_image`

```python
async def edit_image(
    self, purpose: AIPurpose, prompt: str, image: bytes,
    *, size: str | None = None,
) -> bytes: ...
```

- `gpt-image-1`의 이미지 입력은 `generate`가 아니라 **edits 경로**(multipart: `image` + `prompt`).
- `generate_image`와 동일하게: 세마포어, 지수 백오프 재시도(타임아웃/429/5xx/손상), `inspect_image` 검증, 4xx 즉시 실패.
- 응답 디코딩은 기존 `_extract_image_bytes` 재사용.

> ⚠️ **구현 첫 작업 = Mindlogic Factchat가 edits(이미지 입력)를 지원하는지 실제 호출로 검증.**
> - 지원 → `ai_image_edit_api_url`을 Mindlogic edits 경로로 설정.
> - 미지원 → **PORTRAIT purpose만 OpenAI 직결(`/v1/images/edits`)로 분기.** purpose 기반 라우팅이라 깔끔히 분리됨. (이 경우 OpenAI 키·base_url 설정 추가)

### 3.3 `AIService.generate_image_prompts` (AI-05)

- 입력: `Persona { name, tagline, keywords[], fields[] }`
- 출력: `ImagePrompts { portrait_prompt: str, background_prompt: str }` (영문 권장)
- 모델: `ai_model_image_prompt` (gpt-5-mini), `AIClient.chat(AIPurpose.IMAGE_PROMPT, ...)`
- **구조화 출력**: `response_format={"type": "json_object"}` + Pydantic 파싱.
- **검증**: 두 프롬프트 non-empty, 길이 상한(≤4000), 금칙어 없음.
- **폴백**: 파싱/검증 1회 재시도 후에도 실패하면 → `persona.fields`·`keywords` 기반 **결정적 템플릿 프롬프트** 생성(파이프라인이 멈추지 않도록).

### 3.4 `persona_pipeline.generate_card`

```python
async def generate_card(
    ai: AIClient, persona: Persona,
    *, photo: bytes | None, qr_data: str,
) -> CardResult:  # { persona, card_png, timings }
```

1. `prompts = await ai_service.generate_image_prompts(persona)`
2. 인물·배경 **병렬 생성**:
   - 인물: `photo` 있으면 `edit_image(PORTRAIT, prompts.portrait, photo)`, 없으면 `generate_image(PORTRAIT, prompts.portrait)`
   - 배경: `generate_image(WORLD, prompts.background)`
   - 둘 다 성공해야 진행(기존 `generate_card_images` 정책 — edit 경로 포함하도록 일반화)
3. `render_card(background, portrait, PersonaCardContent(...), qr_data)` (스레드풀)
4. 단계별 `timings`(prompts_ms, images_ms, render_ms) 기록

### 3.5 엔드포인트

```
POST /api/dev/persona-card
body: {
  persona: { name, tagline, keywords: [...], fields: [...] },
  photo_base64?: string,         # 없으면 text→image
  qr_data?: string,              # 기본값 dev placeholder
}
→ 200 {
  persona: {...},
  card_base64: string,
  timings: { prompts_ms, images_ms, render_ms, total_ms },
}
```

기존 `/api/dev/image`, `/api/dev/card`는 유지(하위 호환).

---

## 4. 프론트엔드 설계 (dev)

### 4.1 구조

`frontend/app/dev/` 하위에 단계형 흐름 추가. 단일 라우트 + 내부 스텝 상태(또는 `useSessionStore`).

| 스텝 | 화면 | 데이터 |
|---|---|---|
| 0 | 사진 업로드 (기본 샘플 내장) | 파일 → base64, 미선택 시 샘플 사용 |
| 1 | Q1~6 (mock 질문+답변 표시) | `lib/mock` 프리셋 |
| 2~4 | Q7 / Q8 / Q9 (mock) | `lib/mock` 프리셋 |
| 5 | Q10 — 페르소나 후보 3개 클릭 선택 | `lib/mock/personas` |
| 6 | 생성 중 → 카드 표시 | `POST /api/dev/persona-card` 응답 |

### 4.2 동작

- 각 페이지는 **"다음" 버튼만으로 전환** (Framer Motion 페이지 전환).
- 답변은 전부 mock 프리셋 표시 — 실입력 위젯 없음.
- 스텝 5에서 선택한 mock 페르소나 + 스텝 0 사진 → 백엔드 호출.
- 카드 결과는 `/dev/image-test`의 base64 표시 패턴, `components/card/PersonaCard` 재사용.

### 4.3 mock 데이터

`frontend/lib/mock/`에 dev 흐름용 Q&A 프리셋 추가(기존 `questions.ts`/`personas.ts` 확장 또는 신규 `devFlow.ts`). 페르소나 후보 3개는 `personas.ts`의 기존 mock 활용.

---

## 5. 안전장치 & 에러 처리

- **AI-05 출력 검증 실패** → 1회 재시도 → 템플릿 폴백(파이프라인 비중단).
- **이미지 생성 실패** → 기존 재시도 소진 후 `ExternalServiceError`; "둘 다 성공" 정책 유지. 프론트는 에러 메시지 표시.
- **edit 미지원 게이트웨이** → 구현 첫 단계에서 검증 후 provider 분기 결정.
- **photo 누락** → 인물도 text→image로 자동 폴백(흐름 비중단).

---

## 6. 테스트

| 대상 | 방식 |
|---|---|
| `AIClient.edit_image` | `httpx.MockTransport`로 성공/429 재시도/4xx/손상응답 (기존 `test_ai_client_image` 패턴) |
| `AIService.generate_image_prompts` | chat 응답 stub → JSON 파싱·검증·폴백 경로 |
| `persona_pipeline.generate_card` | AI stub(prompts+이미지 bytes) → 카드 PNG 산출 검증 |
| 카드 합성 | 기존 `test_card_renderer` 재사용 |

---

## 7. 작업 순서 (구현 계획에서 상세화)

1. **Mindlogic edits 지원 검증** → provider 분기 결정 (블로킹)
2. 백엔드: `edit_image` → `generate_image_prompts` → `persona_pipeline` → `/api/dev/persona-card` + 스키마 + 프롬프트
3. 백엔드 테스트
4. 프론트: dev 흐름 페이지 + mock 데이터 + 전환 + 백엔드 연동
5. 엔드투엔드 클릭 테스트(사진 업로드 → 카드 표시)

---

## 8. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-06-21 | 초안 — dev 단계 이미지 생성 파이프라인 설계 확정 |
