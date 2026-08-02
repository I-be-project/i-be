"""/api/admin/booths — 부스 등록·조회·수정·삭제와 QR 링크 발급.

부스마다 발급되는 6자 code로 QR 링크를 만든다. code는 인쇄물에 박히므로 수정할 수 없다.
학생이 이 QR을 찍어 완료 인증을 하는 흐름은 다음 단계다.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from app.deps import BoothServiceDep, CurrentAdminDep
from app.schemas.booths import (
    BoothCreateRequest,
    BoothDeleteResponse,
    BoothResponse,
    BoothUpdateRequest,
)

router = APIRouter(prefix="/api/admin/booths", tags=["booths"])


@router.post("", response_model=BoothResponse, status_code=201)
async def create_booth(
    req: BoothCreateRequest,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothResponse:
    """부스 생성 — 6자 code를 자동 발급하고 QR 링크까지 만들어 반환한다."""
    return await booths.create(req)


@router.get("", response_model=list[BoothResponse])
async def list_booths(
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> list[BoothResponse]:
    """전체 부스 목록(등록 순). 부스는 수십 개 규모라 페이지네이션을 두지 않는다."""
    return await booths.list_all()


@router.patch("/{booth_id}", response_model=BoothResponse)
async def update_booth(
    booth_id: UUID,
    req: BoothUpdateRequest,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothResponse:
    """이름·설명 수정. code는 요청 스키마에 없어 변경할 수 없다."""
    return await booths.update(booth_id, req)


@router.delete("/{booth_id}", response_model=BoothDeleteResponse)
async def delete_booth(
    booth_id: UUID,
    _admin: CurrentAdminDep,
    booths: BoothServiceDep,
) -> BoothDeleteResponse:
    """부스 삭제. 인쇄된 QR은 이후 무효가 된다."""
    return await booths.delete(booth_id)
