"""부스 CRUD 서비스 — 코드 발급과 QR 링크 조립을 담당한다."""

from __future__ import annotations

from dataclasses import replace
from uuid import UUID

import asyncpg

from app.config import Settings
from app.core.booth_code import generate_booth_code
from app.core.errors import ConflictError, NotFoundError
from app.repositories.booth_repo import BoothRecord, BoothRepository
from app.schemas.booths import (
    BoothCreateRequest,
    BoothDeleteResponse,
    BoothResponse,
    BoothUpdateRequest,
)

# 31^6 조합이라 충돌은 사실상 나지 않지만, 나더라도 관리자에게 실패를 보이지 않게 재시도한다.
_CODE_MAX_ATTEMPTS = 5


class BoothService:
    def __init__(self, *, booths: BoothRepository, settings: Settings) -> None:
        self._booths = booths
        self._settings = settings

    def _qr_url(self, code: str) -> str:
        """QR에 담을 링크. base는 FRONTEND_ORIGIN 한 곳에서만 정한다.

        프론트에서 window.location.origin으로 조립하면 관리자가 로컬 개발 서버에서 뽑은
        인쇄물에 localhost가 박힌다. 인쇄물은 되돌릴 수 없으므로 서버가 조립해 내려준다.
        """
        return f"{self._settings.frontend_origin.rstrip('/')}/b/{code}"

    def _to_response(self, record: BoothRecord) -> BoothResponse:
        return BoothResponse(
            id=record.id,
            code=record.code,
            name=record.name,
            description=record.description,
            zone=record.zone,
            competencies=list(record.competencies),
            qr_url=self._qr_url(record.code),
            created_at=record.created_at,
        )

    async def create(self, req: BoothCreateRequest) -> BoothResponse:
        """부스 생성 — 코드를 발급하고, 충돌하면 새 코드로 재시도한다."""
        for _ in range(_CODE_MAX_ATTEMPTS):
            try:
                record = await self._booths.create(
                    code=generate_booth_code(),
                    name=req.name,
                    description=req.description,
                    zone=req.zone,
                )
            except asyncpg.UniqueViolationError:
                continue
            # 빈 목록이면 건너뛴다 — 새 부스에는 지울 역량이 없어 재조회가 낭비다.
            return await self._apply_competencies(record, req.competencies or None)
        raise ConflictError("부스 코드를 발급하지 못했습니다. 다시 시도해주세요.")

    async def _apply_competencies(
        self, record: BoothRecord, competencies: list[str] | None
    ) -> BoothResponse:
        """역량을 넣고 최신 상태로 응답을 만든다.

        insert/update의 returning에는 역량이 없어(조인 쿼리가 아니다) 넣은 뒤 다시 읽는다.
        보내지 않았으면(None) 건드리지 않는다.
        """
        if competencies is None:
            return self._to_response(record)
        await self._booths.replace_competencies(record.id, competencies)
        refreshed = await self._booths.get(record.id)
        return self._to_response(refreshed if refreshed is not None else record)

    async def list_all(self) -> list[BoothResponse]:
        """전체 부스 목록 — 등록 순."""
        records = await self._booths.list_all()
        return [self._to_response(record) for record in records]

    async def update(self, booth_id: UUID, req: BoothUpdateRequest) -> BoothResponse:
        """보낸 필드만 반영한다. description에 null을 명시하면 설명이 지워진다.

        name에 명시적 null을 보내는 요청은 BoothUpdateRequest 검증기가 이미 막으므로,
        "name in provided"인 경우 req.name은 항상 값이 채워진 문자열이다.

        조회 후 갱신이라 이론상 경합이 있지만, 관리자 단일 계정이 쓰는 화면이라 허용한다.
        """
        current = await self._booths.get(booth_id)
        if current is None:
            raise NotFoundError("부스를 찾을 수 없습니다.")

        provided = req.model_fields_set
        name = req.name if "name" in provided else current.name
        assert name is not None  # BoothUpdateRequest 검증기가 명시적 null을 이미 거부한다
        description = req.description if "description" in provided else current.description
        zone = req.zone if "zone" in provided else current.zone
        assert zone is not None  # BoothUpdateRequest 검증기가 명시적 null을 이미 거부한다
        competencies = req.competencies if "competencies" in provided else None

        updated = await self._booths.update(booth_id, name=name, description=description, zone=zone)
        if updated is None:
            raise NotFoundError("부스를 찾을 수 없습니다.")
        if competencies is None:
            # update()의 returning에는 역량 컬럼이 없다(조인 쿼리가 아니라서 항상 빈 튜플로
            # 채워져 온다). 보내지 않았으면 건드리지 않아야 하므로, 이미 조회해 둔 current의
            # 값으로 채운다 — get()으로 다시 조회할 필요 없이 이미 손에 있는 값이다.
            updated = replace(updated, competencies=current.competencies)
        return await self._apply_competencies(updated, competencies)

    async def delete(self, booth_id: UUID) -> BoothDeleteResponse:
        if not await self._booths.delete(booth_id):
            raise NotFoundError("부스를 찾을 수 없습니다.")
        return BoothDeleteResponse(booth_id=booth_id)
