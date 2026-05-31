"""도메인 예외와 FastAPI 예외 핸들러.

- 비즈니스 예외는 DomainError 하위 클래스로 분리
- HTTPException 변환과 통일된 응답 포맷
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


class DomainError(Exception):
    """비즈니스 도메인 예외의 기반."""

    status_code: int = 400
    code: str = "domain_error"

    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(DomainError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class RateLimitedError(DomainError):
    status_code = 429
    code = "rate_limited"


class ExternalServiceError(DomainError):
    status_code = 502
    code = "external_service_error"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        logger.info(
            "domain_error",
            code=exc.code,
            message=exc.message,
            path=request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )
