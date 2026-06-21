"""AI-05: 페르소나 → 인물·배경 이미지 프롬프트.

chat 모델이 영문 프롬프트 2개를 JSON으로 산출하게 한다.
파싱·검증 실패 시 fallback_prompts로 파이프라인을 멈추지 않는다.
"""

from __future__ import annotations

from app.schemas.persona import ImagePrompts, Persona

_SYSTEM = (
    "You write concise English prompts for an image generator that builds a "
    "future-self persona card from an uploaded face photo. Return ONLY JSON with "
    'keys "portrait_prompt" and "background_prompt".\n'
    "portrait_prompt: the SAME person as the input photo, aged about 10 years older "
    "— a natural, mature adult (roughly late twenties to early thirties). Keep their "
    "real facial identity and features; make them look grown-up, calm and composed, "
    "NOT elderly — no gray hair, no heavy wrinkles. A realistic, lifelike head-and-"
    "shoulders portrait with soft natural lighting (2:3). Do NOT put them in any job "
    "uniform, costume, or career props, and do NOT tie the portrait to the career — "
    "just their real future self in everyday adult attire.\n"
    "background_prompt: a cinematic world/workplace scene (3:2) reflecting the "
    "persona's career fields and keywords. No people's faces in the background.\n"
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
    """AI 실패 시 결정적 템플릿. 인물은 직업 무관 '10년 뒤 실제 모습', 배경만 직업 반영."""
    subject = ", ".join(persona.fields) or persona.name
    mood = ", ".join(persona.keywords) or "inspiring, modern"
    return ImagePrompts(
        portrait_prompt=(
            "Realistic portrait of the same person from the photo, aged about 10 years "
            "older — a natural, mature adult in their late twenties, grown-up and "
            "composed, NOT elderly, no gray hair or heavy wrinkles, keeping their real "
            "facial identity, everyday adult attire, soft natural lighting, 2:3 ratio, "
            "photorealistic, no text or watermark."
        ),
        background_prompt=(
            f"Cinematic world scene reflecting a career in {subject}, mood: {mood}. "
            "Wide 3:2 ratio, no faces, no text or watermark."
        ),
    )
