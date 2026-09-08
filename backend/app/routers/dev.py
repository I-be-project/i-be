"""/api/dev — 개발·실험용 엔드포인트.

로컬 Codex CLI(`codex exec`)로만 동작한다. OpenRouter(AIClient)는 쓰지 않는다.
배포 서버엔 codex 바이너리가 없고 이 라우터는 인증도 없다 —
등록 자체를 APP_ENV=local로 제한한다(main.create_app).

- GET  /students              학생 선택 목록
- GET  /students/{id}/answers 선택한 학생의 최근 세션 답변(프롬프트 입력 미리보기)
- GET  /prompts               편집기 초깃값
- POST /persona               답변 + 편집한 시스템 프롬프트 → Career Persona
- POST /future-photo          학생 사진 + 편집한 프롬프트 → 10년 뒤 사진
"""

from __future__ import annotations

import base64
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.errors import NotFoundError
from app.core.images import inspect_image
from app.core.prompts.persona_prompt import (
    DEFAULT_SYSTEM_PROMPT,
    PERSONA_OUTPUT_SCHEMA,
    build_user_prompt,
)
from app.deps import (
    CodexClientDep,
    StorageClientDep,
    StudentRepoDep,
    get_session_repo,
)
from app.repositories.session_repo import SessionRepository
from app.schemas.dev import (
    DefaultPromptsResponse,
    DevStudent,
    DevStudentList,
    GenerateFuturePhotoRequest,
    GenerateFuturePhotoResponse,
    GeneratePersonaRequest,
    GeneratePersonaResponse,
    StudentAnswersResponse,
)
from app.services.dev_service import build_persona_inputs

# 원본 사진 Presigned URL 유효시간. admin과 같은 1시간 — dev 세션에 충분하다.
_PHOTO_URL_TTL_SECONDS = 3600

# 미래 사진 생성 기본 프롬프트. 화면에서 편집 가능한 초깃값이다.
#
# 결과를 학생끼리 나란히 놓고 볼 수 있어야 하므로, 원본 사진에서 가져올 것(얼굴 정체성)과
# 버릴 것(배경·구도·복장·조명)을 명시적으로 갈라놓는다. 원본은 교실·야외·단체사진 등
# 제각각이라 이 구분이 없으면 결과도 그만큼 제각각이 된다.
#
# 나이: 참가자가 전원 중학생(1~3학년, 13~15세)이라 10년 뒤는 23~25세다.
# 학년별로 다르지만 한 살 차이는 외형에 거의 안 드러나므로 24세로 고정한다.
DEFAULT_FUTURE_PHOTO_PROMPT = """첨부한 사진 속 인물의 10년 뒤 모습을 담은 증명사진 한 장을 만들어라.

[대상 인물 선택]
- 사진에 사람이 여러 명이면, 화면에서 가장 크게 나오고 중앙에 가장 가까운 인물 한 명만 고른다.
- 고른 한 명 외에는 결과에 넣지 않는다. 결과에는 반드시 한 사람만 나온다.
- 얼굴이 가려지거나 흐린 인물은 고르지 않는다.

[얼굴 정체성 — 원본에서 가져올 것]
- 눈·코·입의 형태와 간격, 얼굴형과 턱선, 피부톤, 점·흉터 같은 고유한 특징을 유지해
  같은 사람으로 알아볼 수 있게 한다.
- 성별과 인종을 바꾸지 않는다.
- 원본에서 안경을 썼으면 비슷한 형태의 안경을 유지한다.
- 24세의 모습으로 그린다. 얼굴 윤곽이 성인으로 또렷해지고 볼의 아기살이 빠지되,
  주름·흰머리·처짐은 넣지 않는다. 24세는 아직 젊다.
- 미화하지 않는다. 이목구비를 고치거나 다른 사람으로 만들면 실패다.

[구도 — 모든 결과가 서로 같아야 한다]
- 세로 2:3 비율, 정면 상반신(가슴 위)만.
- 카메라를 똑바로 바라본다. 고개를 기울이거나 옆으로 돌리지 않는다.
- 양 어깨는 카메라와 나란히. 몸통을 비스듬히 틀지 않는다.
- 눈높이에서 찍은 각도. 내려다보거나 올려다보는 각도를 쓰지 않는다.
- 크기 기준(반드시 지킨다): 정수리 위 여백이 전체 높이의 10%,
  두 눈이 전체 높이의 40% 지점, 정수리부터 턱까지가 전체 높이의 45%.
- 얼굴이 프레임을 꽉 채우게 확대하지 않는다. 좌우로도 어깨가 잘리지 않게 넉넉히 담는다.
- 표정은 입을 다문 옅은 미소. 이를 드러낸 큰 웃음이나 굳은 무표정은 쓰지 않는다.

[배경·조명·복장 — 원본과 무관하게 고정한다]
- 배경: RGB(210, 210, 210)의 균일한 밝은 회색 단색. 무늬·그러데이션·그림자 없이 완전히 평평하게.
  원본의 장소·배경·소품·다른 사람은 모두 버린다.
- 조명: 정면에서 오는 부드럽고 고른 조명. 짙은 그림자나 강한 반사광 없이.
- 복장: 남색 크루넥 니트 하나로 고정한다. 무늬·로고·글자 없이.
  원본의 교복·옷차림·색은 따르지 않는다.

[금지]
- 글자, 워터마크, 로고, 테두리, 액자
- 여러 컷, 콜라주, 분할 화면, 전후 비교 이미지
- 만화·일러스트·3D 렌더링 풍. 실제 카메라로 찍은 사진처럼 보여야 한다."""


router = APIRouter(prefix="/api/dev", tags=["dev"])

SessionRepoDep = Annotated[SessionRepository, Depends(get_session_repo)]


@router.get("/prompts", response_model=DefaultPromptsResponse)
async def get_default_prompts() -> DefaultPromptsResponse:
    """화면의 프롬프트 편집기 초깃값."""
    return DefaultPromptsResponse(
        persona_system_prompt=DEFAULT_SYSTEM_PROMPT,
        future_photo_prompt=DEFAULT_FUTURE_PHOTO_PROMPT,
    )


@router.get("/students", response_model=DevStudentList)
async def list_students(
    students: StudentRepoDep,
    sessions: SessionRepoDep,
    storage: StorageClientDep,
    q: Annotated[str | None, Query(description="이름 부분 일치")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> DevStudentList:
    """학생 선택 목록. 페르소나·사진 생성 가능 여부와 원본 사진 URL을 함께 내린다."""
    _, records = await students.list_students(
        q=q, school=None, grade=None, class_no=None, limit=limit, offset=0, sort="created_desc"
    )
    progress = await sessions.get_progress_for_students([r.id for r in records])
    # 건별로 서명하면 클라이언트 생성 비용(40~50ms)이 건마다 붙는다 — 한 번에 서명한다.
    photo_urls = await storage.create_signed_urls(
        [r.photo_key for r in records if r.photo_key], ttl_seconds=_PHOTO_URL_TTL_SECONDS
    )
    return DevStudentList(
        students=[
            DevStudent(
                id=r.id,
                name=r.name,
                school=r.school,
                grade=r.grade,
                class_no=r.class_no,
                student_no=r.student_no,
                has_photo=bool(r.photo_key),
                photo_url=photo_urls.get(r.photo_key) if r.photo_key else None,
                has_answers=bool(progress[r.id].stages) if r.id in progress else False,
            )
            for r in records
        ]
    )


@router.get("/students/{student_id}/answers", response_model=StudentAnswersResponse)
async def get_student_answers(student_id: UUID, sessions: SessionRepoDep) -> StudentAnswersResponse:
    """학생의 최근 세션 답변을 프롬프트 슬롯 형태로 반환.

    career_pool은 DB에 저장되지 않으므로 여기서는 비운다 — 화면에서 입력받는다.
    """
    session = await sessions.get_latest_for_student(student_id)
    if session is None:
        return StudentAnswersResponse(
            session_id=None,
            status=None,
            riasec_scores={},
            pair_code="",
            q7a_first=None,
            q7a_second=None,
            q7b_first=None,
            q7b_second=None,
            q8_response=None,
            q9_response=None,
        )

    records = await sessions.list_answers(session.id)
    inputs = build_persona_inputs({r.stage: r.payload for r in records}, career_pool=[])
    return StudentAnswersResponse(
        session_id=session.id,
        status=session.status,
        riasec_scores=inputs.riasec_scores,
        pair_code=inputs.pair_code,
        q7a_first=inputs.q7a_first,
        q7a_second=inputs.q7a_second,
        q7b_first=inputs.q7b_first,
        q7b_second=inputs.q7b_second,
        q8_response=inputs.q8_response,
        q9_response=inputs.q9_response,
    )


@router.post("/persona", response_model=GeneratePersonaResponse)
async def generate_persona(
    req: GeneratePersonaRequest, sessions: SessionRepoDep, codex: CodexClientDep
) -> GeneratePersonaResponse:
    """저장된 답변 + 편집한 시스템 프롬프트 → Career Persona 1개 (codex, 이미지 없음)."""
    session = await sessions.get_latest_for_student(req.student_id)
    if session is None:
        raise NotFoundError("이 학생에게는 설문 세션이 없습니다.")

    records = await sessions.list_answers(session.id)
    inputs = build_persona_inputs(
        {r.stage: r.payload for r in records}, career_pool=req.career_pool
    )
    user_prompt = build_user_prompt(
        riasec_scores=inputs.riasec_scores,
        pair_code=inputs.pair_code,
        career_pool=inputs.career_pool,
        q7a_first=inputs.q7a_first,
        q7a_second=inputs.q7a_second,
        q7b_first=inputs.q7b_first,
        q7b_second=inputs.q7b_second,
        q8_response=inputs.q8_response,
        q9_response=inputs.q9_response,
        q1to6_texts=inputs.q1to6_texts,
    )

    started = time.perf_counter()
    result = await codex.generate_json(
        f"{req.system_prompt}\n\n---\n\n{user_prompt}",
        PERSONA_OUTPUT_SCHEMA,
        model=req.model,
    )
    elapsed = time.perf_counter() - started

    return GeneratePersonaResponse(
        **result, user_prompt=user_prompt, elapsed_seconds=round(elapsed, 2)
    )


@router.post("/future-photo", response_model=GenerateFuturePhotoResponse)
async def generate_future_photo(
    req: GenerateFuturePhotoRequest,
    students: StudentRepoDep,
    storage: StorageClientDep,
    codex: CodexClientDep,
) -> GenerateFuturePhotoResponse:
    """학생의 저장된 사진 + 편집한 프롬프트 → 10년 뒤 사진 (codex)."""
    student = await students.get_by_id(req.student_id)
    if student is None:
        raise NotFoundError("학생을 찾을 수 없습니다.")
    if not student.photo_key:
        raise NotFoundError("이 학생에게는 저장된 사진이 없습니다.")

    photo = await storage.download(student.photo_key)

    started = time.perf_counter()
    image_bytes = await codex.generate_image(req.prompt, photo=photo, model=req.model)
    elapsed = time.perf_counter() - started

    info = inspect_image(image_bytes)
    return GenerateFuturePhotoResponse(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        size_bytes=len(image_bytes),
        width=info.width,
        height=info.height,
        elapsed_seconds=round(elapsed, 2),
    )
