"""dev 라우터용 Request/Response 모델.

dev는 로컬 Codex CLI로만 동작한다 — OpenRouter(AIClient)를 쓰지 않는다.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DevStudent(BaseModel):
    """학생 선택용 최소 정보. 비밀번호·생년월일 등 나머지 PII는 내리지 않는다."""

    id: UUID
    name: str
    school: str
    grade: int
    class_no: int
    student_no: int
    has_photo: bool = Field(..., description="사진(photo_key)이 있는지 — 미래 사진 생성 가능 여부")
    photo_url: str | None = Field(
        None, description="원본 사진 Presigned GET URL(1시간). 생성 결과와 나란히 비교하는 용도"
    )
    has_answers: bool = Field(..., description="설문 답변이 있는지 — 페르소나 생성 가능 여부")


class DevStudentList(BaseModel):
    students: list[DevStudent]


class StudentAnswersResponse(BaseModel):
    """선택한 학생의 최근 세션 답변 — dev 화면이 프롬프트 입력을 미리 보여준다."""

    session_id: UUID | None
    status: str | None
    riasec_scores: dict[str, int]
    pair_code: str
    career_pool: list[str] = Field(description="Pair Code 기본 Career Pool (편집 초깃값)")
    q7a_first: str | None
    q7a_second: str | None
    q7b_first: str | None
    q7b_second: str | None
    q8_response: str | None
    q9_response: str | None


class DefaultPromptsResponse(BaseModel):
    """화면의 프롬프트 편집기 초깃값."""

    persona_system_prompt: str
    future_photo_prompt: str


class GeneratePersonaRequest(BaseModel):
    student_id: UUID
    system_prompt: str = Field(
        ..., min_length=1, max_length=20000, description="편집 가능한 시스템 프롬프트"
    )
    career_pool: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="현실 직업 후보. 비우면 Pair Code 기본 풀을 쓴다.",
    )
    model: str | None = Field(None, description="codex 모델 override. 미지정 시 codex 기본값")


class GeneratePersonaResponse(BaseModel):
    """「Persona 생성 규칙 v1」 13장 출력 계약 + dev 관측용 필드."""

    persona_name: str
    base_career: str
    short_description: str
    source_career_pool: bool
    pool_extended: bool
    q8_reflection: str
    q9_reflection: str
    user_prompt: str = Field(..., description="실제로 codex에 보낸 user 프롬프트 (디버깅용)")
    elapsed_seconds: float


class GenerateFuturePhotoRequest(BaseModel):
    student_id: UUID
    prompt: str = Field(..., min_length=1, max_length=4000, description="편집 가능한 생성 프롬프트")
    model: str | None = Field(None, description="codex 모델 override. 미지정 시 codex 기본값")


class GenerateFuturePhotoResponse(BaseModel):
    image_base64: str = Field(..., description="생성된 PNG의 base64")
    size_bytes: int
    width: int
    height: int
    elapsed_seconds: float


# ──────────────────────────────────────────────────────────────
# 검수 (/api/dev/drafts)
# ──────────────────────────────────────────────────────────────


class DraftItem(BaseModel):
    """검수 화면 한 줄 — 초안 + 학생 정보 + 이미지 URL."""

    id: UUID
    student_id: UUID
    status: str = Field(..., description="pending | approved | rejected")
    student_name: str
    school: str
    grade: int
    class_no: int
    student_no: int
    name: str = Field(..., description="persona_name 전체")
    base_career: str = Field(..., description="카드 아랫줄(직업명)")
    headline: str = Field(..., description="카드 윗줄(수식어)")
    tagline: str = Field(..., description="short_description")
    source_career_pool: bool | None
    pool_extended: bool | None
    raw: dict[str, object] = Field(..., description="codex 출력 원본")
    photo_url: str | None = Field(None, description="원본 사진 Presigned URL")
    image_url: str | None = Field(None, description="생성 이미지 Presigned URL")
    error: str | None = Field(None, description="마지막 이미지 생성 실패 사유")
    note: str


class DraftList(BaseModel):
    drafts: list[DraftItem]
    counts: dict[str, int] = Field(..., description="상태별 전체 개수")


class DraftUpdate(BaseModel):
    """검수자가 고치는 카드 문구."""

    name: str = Field(..., max_length=200)
    base_career: str = Field(..., min_length=1, max_length=60)
    headline: str = Field(..., max_length=80)
    tagline: str = Field(..., max_length=500)
    note: str = Field("", max_length=1000)


class CardPreview(BaseModel):
    image_base64: str = Field(..., description="카드 PNG (base64)")


# ──────────────────────────────────────────────────────────────
# 일괄 생성 (/api/dev/drafts/batch)
# ──────────────────────────────────────────────────────────────


class DevClass(BaseModel):
    grade: int
    class_no: int
    total: int = Field(..., description="반 학생 수")
    completed: int = Field(..., description="설문 완료 학생 수")
    targets: int = Field(..., description="초안이 없는 완료자 수 — 일괄 생성 대상")


class BatchClass(BaseModel):
    school: str = Field(..., min_length=1)
    grade: int
    class_no: int


class BatchRequest(BaseModel):
    classes: list[BatchClass] = Field(..., min_length=1, max_length=500)
    concurrency: int = Field(
        2, ge=1, le=20, description="동시 codex 실행 수. 상한은 ChatGPT 계정 사용량 한도가 정한다"
    )


class BatchStatus(BaseModel):
    label: str
    total: int
    done: int
    failed: int
    running: bool
    cancelled: bool
    started_at: datetime | None
    finished_at: datetime | None
    errors: list[str] = Field(..., description="최근 텍스트 생성 실패(최대 10개)")
