"""리워드 규칙·적립 비즈니스 로직."""

from __future__ import annotations


class RewardService:
    async def apply_rule(self, *args: object, **kwargs: object) -> object:
        """학생 + 부스 + 규칙 조합으로 적립 1건 생성."""
        raise NotImplementedError

    async def list_for_card(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
