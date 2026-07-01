"""ops.audit_logs 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class AuditRepository(BaseRepository):
    async def log(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
