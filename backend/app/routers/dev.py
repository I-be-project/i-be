"""/api/dev — 개발·실험용 엔드포인트.

운영에서는 비활성화 권장 (APP_ENV 가드 추후 추가).
"""

from __future__ import annotations

import base64
import time

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.adapters.ai_client import AIPurpose
from app.config import get_settings
from app.core.images import inspect_image
from app.deps import AIClientDep
from app.schemas.dev import (
    GenerateCardRequest,
    GenerateCardResponse,
    GenerateImageRequest,
    GenerateImageResponse,
    ImageTarget,
)
from app.services.card_image_service import generate_card_images
from app.services.card_renderer import PersonaCardContent, render_card

router = APIRouter(prefix="/api/dev", tags=["dev"])


# target → (사이즈, AI 라벨). 카드 의도에 맞는 사이즈를 자동으로 선택.
_TARGET_PRESETS: dict[ImageTarget, tuple[str, AIPurpose]] = {
    "id_photo": ("1024x1536", AIPurpose.PORTRAIT_IMAGE),
    "card_background": ("1536x1024", AIPurpose.WORLD_IMAGE),
}


@router.post("/image", response_model=GenerateImageResponse)
async def generate_image(req: GenerateImageRequest, ai: AIClientDep) -> GenerateImageResponse:
    """프롬프트를 받아 이미지를 생성하고 base64로 반환.

    target에 따라 사이즈 자동 매핑:
    - id_photo:        1024x1536 (증명사진 비율, 2:3)
    - card_background: 1536x1024 (신용카드 비율, 3:2)
    """
    preset_size, purpose = _TARGET_PRESETS[req.target]
    effective_size = req.size or preset_size
    settings = get_settings()

    started = time.perf_counter()
    image_bytes = await ai.generate_image(purpose, req.prompt, size=effective_size)
    elapsed = time.perf_counter() - started

    return GenerateImageResponse(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        size_bytes=len(image_bytes),
        elapsed_seconds=round(elapsed, 2),
        model=settings.ai_image_model,
        size=effective_size,
        target=req.target,
        prompt=req.prompt,
    )


@router.post("/card", response_model=GenerateCardResponse)
async def generate_card(req: GenerateCardRequest, ai: AIClientDep) -> GenerateCardResponse:
    """프롬프트·페르소나로 완성된 페르소나 카드 PNG 한 장을 생성.

    흐름: 인물+배경 그림 병렬 생성 → Pillow 합성(글자·QR) → base64 반환.
    합성은 CPU 바운드라 스레드풀에서 실행해 이벤트 루프를 막지 않는다.
    """
    started = time.perf_counter()

    images = await generate_card_images(
        ai,
        portrait_prompt=req.portrait_prompt,
        background_prompt=req.background_prompt,
    )
    content = PersonaCardContent(title=req.title, tagline=req.tagline, keywords=req.keywords)
    card_png = await run_in_threadpool(
        render_card, images.background, images.portrait, content, req.qr_data
    )
    elapsed = time.perf_counter() - started

    info = inspect_image(card_png)
    return GenerateCardResponse(
        image_base64=base64.b64encode(card_png).decode("ascii"),
        size_bytes=len(card_png),
        width=info.width,
        height=info.height,
        elapsed_seconds=round(elapsed, 2),
    )
