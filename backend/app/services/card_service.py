"""카드 생성 잡 큐잉 + 워커가 호출하는 실제 생성 로직."""

from __future__ import annotations


class CardService:
    async def enqueue_generation(self, *args: object, **kwargs: object) -> object:
        """jobs 테이블에 generate_card 잡 등록 후 job_id 반환."""
        raise NotImplementedError

    async def run_generation(self, *args: object, **kwargs: object) -> object:
        """워커가 호출. AI-04 → AI-05 → IMG-01,02 → cards INSERT."""
        raise NotImplementedError

    async def get_card(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def create_share_link(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
