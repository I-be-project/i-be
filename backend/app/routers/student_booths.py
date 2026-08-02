"""/api/booths — 학생이 부스 QR을 찍고 방문을 인증하는 흐름.

관리자용 CRUD는 /api/admin/booths(app/routers/booths.py)에 따로 있다. 여기는 학생 토큰 전용이고,
부스 id 대신 인쇄물에 박힌 6자 code로 부스를 지목한다.

화면 흐름: /b/<code> 진입 → GET으로 어떤 부스인지 확인 → 학생이 버튼을 누르면 POST로 기록.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path

from app.deps import BoothVisitServiceDep, CurrentStudentDep
from app.schemas.booths import BoothVisitResponse, StudentBoothResponse

router = APIRouter(prefix="/api/booths", tags=["booths"])

# 코드는 6자지만 대소문자·여백이 섞여 들어올 수 있어 형식 검증은 서비스에 맡긴다.
# 여기서는 터무니없이 긴 입력만 잘라낸다(형식이 틀리면 조회에서 404).
BoothCodePath = Annotated[str, Path(min_length=1, max_length=32, description="6자 부스 코드")]


@router.get("/{code}", response_model=StudentBoothResponse)
async def get_booth(
    code: BoothCodePath,
    student_id: CurrentStudentDep,
    visits: BoothVisitServiceDep,
) -> StudentBoothResponse:
    """QR로 들어온 부스 정보 + 이 학생의 방문 여부. 카드 발급 전이면 403."""
    return await visits.get_booth(student_id=student_id, code=code)


@router.post("/{code}/visit", response_model=BoothVisitResponse)
async def check_in(
    code: BoothCodePath,
    student_id: CurrentStudentDep,
    visits: BoothVisitServiceDep,
) -> BoothVisitResponse:
    """방문 기록. 같은 부스를 다시 찍어도 에러가 아니라 already_visited=true로 200."""
    return await visits.check_in(student_id=student_id, code=code)
