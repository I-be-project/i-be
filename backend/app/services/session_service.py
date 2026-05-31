"""세션 생성, 답변 저장, 적응형/최종 질문 생성(짧은 AI 동기 호출)."""

from __future__ import annotations


class SessionService:
    async def start(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def submit_answer(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def get_next_question(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
