"""AI-05: 페르소나 → 인물·배경 이미지 프롬프트.

chat 모델이 영문 프롬프트 2개를 JSON으로 산출하게 한다.
파싱·검증 실패 시 fallback_prompts로 파이프라인을 멈추지 않는다.
"""

from __future__ import annotations

from app.schemas.persona import ImagePrompts, Persona

_SYSTEM = (
    "You write concise English prompts for an image generator that produces "
    "a future-career persona card. Return ONLY JSON with keys "
    '"portrait_prompt" and "background_prompt". '
    "portrait_prompt: a confident future professional portrait (2:3, studio lighting). "
    "background_prompt: a cinematic workplace/world scene (3:2) for that career. "
    "No text, logos, or watermarks in the images. Keep each prompt under 600 characters."
)


def build_messages(persona: Persona) -> list[dict[str, str]]:
    keywords = ", ".join(persona.keywords) or "(none)"
    fields = ", ".join(persona.fields) or "(none)"
    user = (
        f"Persona name: {persona.name}\n"
        f"Tagline: {persona.tagline}\n"
        f"Keywords: {keywords}\n"
        f"Related fields: {fields}\n"
        "Write the two image prompts."
    )
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": user},
    ]


def fallback_prompts(persona: Persona) -> ImagePrompts:
    """AI 실패 시 결정적 템플릿. fields/keywords로 안전한 프롬프트 구성."""
    subject = ", ".join(persona.fields) or persona.name
    mood = ", ".join(persona.keywords) or "inspiring, modern"
    return ImagePrompts(
        portrait_prompt=(
            f"Studio portrait of a confident future professional working in {subject}. "
            "Clean lighting, 2:3 ratio, photorealistic, no text or watermark."
        ),
        background_prompt=(
            f"Cinematic workplace scene representing a career in {subject}, "
            f"mood: {mood}. Wide 3:2 ratio, no text or watermark."
        ),
    )
