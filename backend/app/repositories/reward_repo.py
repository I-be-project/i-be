"""rewards.reward_logs, rewards.reward_rules 접근."""

from __future__ import annotations

from app.repositories.base import BaseRepository


class RewardRepository(BaseRepository):
    async def insert_log(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def list_for_card(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def list_for_booth(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def list_rules(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
