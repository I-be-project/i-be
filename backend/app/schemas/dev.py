"""dev 라우터용 Request/Response 모델.

dev는 로컬 Codex CLI로만 동작한다 — OpenRouter(AIClient)를 쓰지 않는다.
"""

from __future__ import annotations

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
        description="Pair Code 기반 현실 직업 후보. DB에 저장되지 않아 화면에서 입력받는다.",
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
