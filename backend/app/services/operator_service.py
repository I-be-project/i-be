"""운영자 로그인·스캔·리워드 적립 로직."""

from __future__ import annotations


class OperatorService:
    async def login(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def scan_card(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def grant_reward(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
