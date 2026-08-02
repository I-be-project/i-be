"""FastAPI 진입점.

- lifespan에서 DB 풀·AI 클라이언트·백그라운드 워커 시작/종료
- 라우터 등록, CORS, 예외 핸들러
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.ai_client import AIClient
from app.adapters.db_pool import DBPool
from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.routers import (
    admin,
    auth,
    booths,
    cards,
    dev,
    operator,
    questions,
    sessions,
    student_booths,
    students,
)
from app.workers.card_worker import card_worker_loop

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("app.startup", env=settings.app_env)

    # AI 클라이언트 — 싱글톤 (httpx 연결 풀 공유)
    ai_client = AIClient.from_settings(settings)
    app.state.ai_client = ai_client

    # DB 풀 — 옵션 (DATABASE_ENABLED=false면 건너뜀, 예: 이미지 단독 테스트 시)
    db_pool: DBPool | None = None
    if settings.database_enabled:
        db_pool = DBPool(settings.database_url)
        await db_pool.connect()
    app.state.db_pool = db_pool

    # 카드 워커 — DB 활성화 + 명시 활성화 시에만 실행
    worker_task: asyncio.Task[None] | None = None
    if settings.database_enabled and settings.card_worker_enabled:
        worker_task = asyncio.create_task(card_worker_loop(), name="card_worker")
        logger.info("worker.started", concurrency=settings.card_worker_concurrency)

    try:
        yield
    finally:
        if worker_task is not None:
            worker_task.cancel()
            try:
                await worker_task
            except asyncio.CancelledError:
                pass
            logger.info("worker.stopped")

        if db_pool is not None:
            await db_pool.disconnect()

        await ai_client.aclose()
        logger.info("app.shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="진로 내비게이터 API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — 기본은 전 오리진 개방(CORS_ALLOW_ORIGINS=*). 외부 시스템이 브라우저에서
    # 관리자 API를 직접 호출할 수 있도록 열어둔다. 특정 오리진으로 좁히려면 .env에서
    # CORS_ALLOW_ORIGINS를 콤마로 나열한다.
    # 참고: Starlette은 "*" + allow_credentials 조합일 때 Access-Control-Allow-Origin에
    # 요청 Origin을 그대로 되돌려주므로(+ Vary: Origin) 인증 요청도 정상 통과한다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(cards.router)
    app.include_router(students.router)
    app.include_router(operator.router)
    app.include_router(admin.router)
    app.include_router(booths.router)
    app.include_router(student_booths.router)
    app.include_router(questions.router)

    # /api/dev는 인증이 없고 호출 시 AI 크레딧을 소모한다. CORS가 전 오리진 개방이라
    # 외부에 노출되면 누구나 크레딧을 태울 수 있으므로 로컬에서만 등록한다.
    if settings.app_env == "local":
        app.include_router(dev.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
