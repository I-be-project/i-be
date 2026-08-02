"""학생 부스 방문 서비스 — 코드로 부스를 찾고 방문을 기록한다.

완료 게이트: 부스 인증은 카드를 받은 뒤에만 할 수 있다. 이 판정을 프론트의 로컬
상태(surveyCompleted)로 하지 않고 여기서 하는 이유가 있다. 학생이 폰 기본 카메라로
QR을 찍으면 링크는 설문을 진행하던 브라우저가 아닌 곳에서 열릴 수 있고, 그러면
localStorage가 비어 있어 "카드를 이미 받은 학생"이 미완료로 보인다. 판정 근거를
서버(generated.sessions)에 두면 어느 브라우저에서 열어도 같은 결과가 나온다.
"""

from __future__ import annotations

from uuid import UUID

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.repositories.booth_repo import BoothRecord, BoothRepository
from app.repositories.booth_visit_repo import BoothVisitRepository
from app.repositories.session_repo import SessionRepository
from app.schemas.booths import BoothVisitResponse, StudentBoothResponse


def _normalize_code(code: str) -> str:
    """URL/수동 입력으로 들어온 코드를 조회용으로 다듬는다.

    코드 알파벳이 전부 대문자라 소문자로 들어온 링크(/b/yp7phr)도 받아준다.
    """
    return code.strip().upper()


class BoothVisitService:
    def __init__(
        self,
        *,
        booths: BoothRepository,
        visits: BoothVisitRepository,
        sessions: SessionRepository,
    ) -> None:
        self._booths = booths
        self._visits = visits
        self._sessions = sessions

    async def _require_completed(self, student_id: UUID) -> None:
        """카드 발급(설문 완료)을 마친 학생인지 확인한다."""
        completed = await self._sessions.get_latest_completed_for_student(student_id)
        if completed is None:
            raise ForbiddenError("탐험을 끝내고 카드를 받은 뒤에 부스를 인증할 수 있어요.")

    async def _find_booth(self, code: str) -> BoothRecord:
        booth = await self._booths.get_by_code(_normalize_code(code))
        if booth is None:
            raise NotFoundError("부스를 찾을 수 없어요. QR을 다시 확인해주세요.")
        return booth

    async def get_booth(self, *, student_id: UUID, code: str) -> StudentBoothResponse:
        """QR로 들어온 학생에게 보여줄 부스 정보 + 이 학생의 방문 여부."""
        await self._require_completed(student_id)
        booth = await self._find_booth(code)
        visit = await self._visits.get(student_id=student_id, booth_id=booth.id)
        return StudentBoothResponse(
            code=booth.code,
            name=booth.name,
            description=booth.description,
            visited=visit is not None,
            visited_at=visit.created_at if visit is not None else None,
        )

    async def check_in(self, *, student_id: UUID, code: str) -> BoothVisitResponse:
        """방문 기록. 이미 기록이 있으면 에러가 아니라 already_visited=true로 응답한다."""
        await self._require_completed(student_id)
        booth = await self._find_booth(code)

        created = await self._visits.create(student_id=student_id, booth_id=booth.id)
        if created is not None:
            return BoothVisitResponse(
                code=booth.code,
                name=booth.name,
                visited_at=created.created_at,
                already_visited=False,
            )

        # insert가 unique 제약에 걸렸다 = 이미 방문 기록이 있다. 첫 방문 시각을 그대로 돌려준다.
        existing = await self._visits.get(student_id=student_id, booth_id=booth.id)
        if existing is None:
            # 삽입은 충돌했는데 조회는 비었다 — 그 사이 기록이 지워진 경합.
            # 드물지만 거짓 성공을 내보내는 것보다 재시도를 안내하는 편이 낫다.
            raise ConflictError("방문 기록에 실패했어요. 다시 시도해주세요.")
        return BoothVisitResponse(
            code=booth.code,
            name=booth.name,
            visited_at=existing.created_at,
            already_visited=True,
        )
