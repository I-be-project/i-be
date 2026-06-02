"""FastAPI 의존성 주입.

- DB 풀, AI 클라이언트, Storage 클라이언트는 lifespan에서 1회 생성된 인스턴스를 공유한다.
- 라우터에서는 Annotated[X, Depends(get_x)] 형태로 사용.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from app.adapters.ai_client import AIClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.config import Settings, get_settings


def get_db_pool(request: Request) -> DBPool:
    pool: DBPool | None = request.app.state.db_pool
    if pool is None:
        raise RuntimeError("DATABASE_ENABLED=false 상태에서는 DB 풀을 사용할 수 없습니다.")
    return pool


def get_ai_client(request: Request) -> AIClient:
    client: AIClient = request.app.state.ai_client
    return client


SettingsDep = Annotated[Settings, Depends(get_settings)]
DBPoolDep = Annotated[DBPool, Depends(get_db_pool)]
AIClientDep = Annotated[AIClient, Depends(get_ai_client)]


def get_storage_client(settings: SettingsDep) -> StorageClient:
    return StorageClient.from_settings(settings)


StorageClientDep = Annotated[StorageClient, Depends(get_storage_client)]
