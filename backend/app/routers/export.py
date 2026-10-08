"""/api/export/v1 — 외부 시스템에 학생 정보·설문·원본 사진·AI 생성 이미지를 넘긴다.

관리자 토큰이 아니라 조회 전용 키(EXPORT_API_KEY)로 인증한다 — 받는 쪽이 삭제·수정
API에 닿지 않게, 그리고 관리자 비밀번호와 따로 끊을 수 있게.
"""

from __future__ import annotations

import secrets
from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.adapters.storage_client import StorageClient
from app.core.errors import NotFoundError, UnauthorizedError
from app.deps import (
    BoothRepoDep,
    BoothVisitRepoDep,
    ExportRepoDep,
    SettingsDep,
    StorageClientDep,
)
from app.repositories.booth_repo import BoothRepository
from app.repositories.booth_visit_repo import BoothVisitRecord, BoothVisitRepository
from app.repositories.export_repo import ExportRow
from app.repositories.session_repo import AnswerRecord
from app.schemas.export import (
    ExportBooth,
    ExportPage,
    ExportPersona,
    ExportStudent,
    ExportSurvey,
    ExportVisitedBooth,
)
from app.services.admin_service import readable_answers
from app.services.session_service import compute_competency_scores

_URL_TTL_SECONDS = 3600

_bearer = HTTPBearer(auto_error=False)


def require_export_key(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
) -> None:
    """Authorization: Bearer <EXPORT_API_KEY>. 키가 비어 있으면 내보내기 자체가 꺼진다."""
    key = settings.export_api_key
    if not key:
        raise UnauthorizedError("내보내기 API가 비활성화돼 있습니다.")
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), key.encode()
    ):
        raise UnauthorizedError("유효하지 않은 내보내기 키입니다.")


router = APIRouter(
    prefix="/api/export/v1", tags=["export"], dependencies=[Depends(require_export_key)]
)


@router.get("/students", response_model=ExportPage)
async def export_students(
    repo: ExportRepoDep,
    storage: StorageClientDep,
    booths: BoothRepoDep,
    visits: BoothVisitRepoDep,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> ExportPage:
    """학생 id 순 페이지. next_cursor가 null이 될 때까지 cursor에 넣어 반복 호출한다."""
    rows, answers = await repo.page(after=cursor, limit=limit)
    items = await _to_students(rows, answers, storage, booths, visits)
    return ExportPage(items=items, next_cursor=rows[-1].id if len(rows) == limit else None)


@router.get("/students/{student_id}", response_model=ExportStudent)
async def export_student(
    student_id: UUID,
    repo: ExportRepoDep,
    storage: StorageClientDep,
    booths: BoothRepoDep,
    visits: BoothVisitRepoDep,
) -> ExportStudent:
    """학생 1명 — 목록 한 항목과 같은 모양. 없거나 삭제·테스트 계정이면 404."""
    rows, answers = await repo.page(after=None, limit=1, student_id=student_id)
    if not rows:
        raise NotFoundError("학생을 찾을 수 없습니다.")
    return (await _to_students(rows, answers, storage, booths, visits))[0]


@router.get("/booths", response_model=list[ExportBooth])
async def export_booths(booths: BoothRepoDep) -> list[ExportBooth]:
    """행사 전체 부스 — 등록 순. 학생 booths[].id와 같은 id."""
    return [
        ExportBooth(
            id=b.id,
            name=b.name,
            zone=b.zone,
            description=b.description,
            competencies=list(b.competencies),
        )
        for b in await booths.list_all()
    ]


async def _to_students(
    rows: list[ExportRow],
    answers: dict[UUID, list[AnswerRecord]],
    storage: StorageClient,
    booth_repo: BoothRepository,
    visit_repo: BoothVisitRepository,
) -> list[ExportStudent]:
    """페이지 단위로 부스·방문을 한 번씩만 읽는다. 역량 점수는 학생 프로필과 같은 계산."""
    booths = {b.id: b for b in await booth_repo.list_all()}
    booth_competencies = {b.id: b.competencies for b in booths.values()}
    visited: dict[UUID, list[BoothVisitRecord]] = defaultdict(list)
    # 부스가 지워졌으면 방문 기록도 건너뛴다. 방문 순.
    for v in sorted(
        await visit_repo.list_for_students([r.id for r in rows]), key=lambda v: v.created_at
    ):
        if v.booth_id in booths:
            visited[v.student_id].append(v)

    keys = [k for r in rows for k in (r.photo_key, r.persona and r.persona.image_key) if k]
    urls = await storage.create_signed_urls(keys, ttl_seconds=_URL_TTL_SECONDS)

    items = []
    for r in rows:
        survey = None
        if r.session_id and r.session_status and r.session_created_at:
            qa, riasec, pair_code = readable_answers(answers.get(r.session_id, []))
            survey = ExportSurvey(
                session_id=r.session_id,
                status=r.session_status,
                started_at=r.session_created_at,
                completed_at=r.completed_at,
                riasec=riasec,
                pair_code=pair_code,
                answers=qa,
            )
        p = r.persona
        items.append(
            ExportStudent(
                id=r.id,
                kind=r.kind,
                school=r.school,
                grade=r.grade,
                class_no=r.class_no,
                student_no=r.student_no,
                name=r.name,
                gender=r.gender,
                birth_date=r.birth_date,
                consent_privacy=r.consent_privacy,
                created_at=r.created_at,
                photo_url=urls.get(r.photo_key) if r.photo_key else None,
                survey=survey,
                persona=ExportPersona(
                    name=p.name,
                    headline=p.headline,
                    base_career=p.base_career,
                    tagline=p.tagline,
                    competencies=p.competencies,
                    image_url=urls.get(p.image_key) if p.image_key else None,
                    approved_at=p.approved_at,
                )
                if p
                else None,
                booths=[
                    ExportVisitedBooth(
                        id=v.booth_id,
                        name=booths[v.booth_id].name,
                        zone=booths[v.booth_id].zone,
                        visited_at=v.created_at,
                    )
                    for v in visited[r.id]
                ],
                competency_scores=compute_competency_scores(
                    booth_competencies=booth_competencies,
                    visited_booth_ids={v.booth_id for v in visited[r.id]},
                ),
            )
        )
    return items
