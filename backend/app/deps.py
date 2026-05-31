"""FastAPI 의존성 주입.

- 현재 학생/운영자/관리자 추출
- DB 풀, AI 클라이언트, Storage 클라이언트 주입
- 라우터에서는 Annotated[Service, Depends(...)] 형태로 사용
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from app.adapters.ai_client import AIClient
from app.adapters.db_pool import DBPool
from app.adapters.storage_client import StorageClient
from app.config import Settings, get_settings


def get_db_pool(request: Request) -> DBPool:
    pool: DBPool = request.app.state.db_pool
    return pool


SettingsDep = Annotated[Settings, Depends(get_settings)]
DBPoolDep = Annotated[DBPool, Depends(get_db_pool)]


def get_ai_client(settings: SettingsDep) -> AIClient:
    return AIClient.from_settings(settings)


def get_storage_client(settings: SettingsDep) -> StorageClient:
    return StorageClient.from_settings(settings)


AIClientDep = Annotated[AIClient, Depends(get_ai_client)]
StorageClientDep = Annotated[StorageClient, Depends(get_storage_client)]
