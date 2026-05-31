"""AI 호출 비즈니스 래퍼.

- Adapter(AIClient)는 단순 호출, Service는 응답 검증·후처리·재시도 정책 적용.
"""

from __future__ import annotations


class AIService:
    async def analyze_responses(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_adaptive_questions(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_final_question(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def create_persona(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_image_prompts(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError

    async def generate_images(self, *args: object, **kwargs: object) -> object:
        raise NotImplementedError
