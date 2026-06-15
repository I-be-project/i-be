"""페르소나 카드 합성 (Pillow).

배경 그림 위에 인물 그림·페르소나 텍스트·QR을 얹어 완성된 카드 PNG 한 장을 만든다.
레이아웃은 프론트 목업(`frontend/app/dev/image-test`)의 신용카드 비율 카드와 동일.
모든 좌표는 캔버스 비율 상수로 분리해 조정하기 쉽게 했다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import qrcode  # type: ignore[import-untyped]
from PIL import Image, ImageDraw, ImageFont, ImageOps

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# ─── 캔버스 (신용카드 비율 1.586:1) ───────────────────────
CARD_W = 1536
CARD_H = 968

# ─── 레이아웃 (캔버스 대비 비율) ──────────────────────────
PORTRAIT_LEFT = 0.04
PORTRAIT_TOP = 0.12
PORTRAIT_BOTTOM = 0.12
PORTRAIT_BORDER = 6
PORTRAIT_RADIUS = 22

TEXT_TOP = 0.15
TEXT_RIGHT = 0.93
TEXT_GAP_FROM_PORTRAIT = 0.03

QR_SIZE_RATIO = 0.14
QR_MARGIN_RIGHT = 0.04
QR_MARGIN_BOTTOM = 0.08
QR_PAD = 14
QR_RADIUS = 16

# ─── 폰트 크기 ────────────────────────────────────────────
LABEL_SIZE = 26
TITLE_SIZE = 76
TAGLINE_SIZE = 30
KEYWORD_SIZE = 28

# ─── 색 ───────────────────────────────────────────────────
WHITE = (255, 255, 255, 255)
LABEL_COLOR = (255, 255, 255, 220)
TAGLINE_COLOR = (255, 255, 255, 235)
CHIP_BG = (255, 255, 255, 48)
SHADOW_COLOR = (0, 0, 0, 150)
SHADOW_OFFSET = 3


@dataclass(frozen=True)
class PersonaCardContent:
    title: str
    tagline: str = ""
    keywords: list[str] = field(default_factory=list)
    label: str = "나Be한마당 페르소나"


@lru_cache(maxsize=8)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    path = _FONT_DIR / f"Pretendard-{weight}.otf"
    return ImageFont.truetype(str(path), size)


def _fit_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """비율 유지하며 영역을 꽉 채우도록 크롭(object-cover)."""
    return ImageOps.fit(img, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))


def _rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255
    )
    return mask


def _gradient_overlay(size: tuple[int, int]) -> Image.Image:
    """좌→우 어둠 그라데이션 (좌측 진하게, 중앙 투명, 우측 약하게).

    프론트의 from-black/40 via-transparent to-black/20 재현.
    """
    w, h = size
    left_a, mid_a, right_a = 110, 0, 55
    row = Image.new("L", (w, 1))
    half = w // 2
    pixels = []
    for x in range(w):
        if x < half:
            t = x / max(half, 1)
            pixels.append(int(left_a + (mid_a - left_a) * t))
        else:
            t = (x - half) / max(w - half, 1)
            pixels.append(int(mid_a + (right_a - mid_a) * t))
    row.putdata(pixels)
    alpha = row.resize((w, h))
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    overlay.putalpha(alpha)
    return overlay


def _portrait_tile(portrait_png: bytes, box: tuple[int, int]) -> Image.Image:
    """인물 그림을 흰 테두리 + 둥근 모서리 타일로."""
    box_w, box_h = box
    src = Image.open(BytesIO(portrait_png)).convert("RGBA")
    inner = _fit_cover(src, (box_w, box_h))
    inner.putalpha(_rounded_mask((box_w, box_h), PORTRAIT_RADIUS))

    b = PORTRAIT_BORDER
    tile = Image.new("RGBA", (box_w + 2 * b, box_h + 2 * b), (0, 0, 0, 0))
    white = Image.new("RGBA", (box_w + 2 * b, box_h + 2 * b), WHITE)
    white.putalpha(_rounded_mask((box_w + 2 * b, box_h + 2 * b), PORTRAIT_RADIUS + b))
    tile.alpha_composite(white)
    tile.alpha_composite(inner, dest=(b, b))
    return tile


def _build_qr(data: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    resized: Image.Image = img.resize((size, size), Image.Resampling.NEAREST)
    return resized


def _qr_tile(data: str, size: int) -> Image.Image:
    inner = size - 2 * QR_PAD
    qr = _build_qr(data, inner)
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 235))
    bg.putalpha(_rounded_mask((size, size), QR_RADIUS))
    tile.alpha_composite(bg)
    tile.alpha_composite(qr, dest=(QR_PAD, QR_PAD))
    return tile


def _wrap(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int
) -> list[str]:
    """단어/글자 단위 줄바꿈. 한글은 공백이 적어 글자 단위로도 끊는다."""
    if not text:
        return []
    lines: list[str] = []
    current = ""
    for token in text.split(" "):
        candidate = f"{current} {token}".strip()
        if draw.textlength(candidate, font=font) <= max_w or not current:
            current = candidate
        else:
            lines.append(current)
            current = token
    if current:
        lines.append(current)

    # 한 토큰이 너무 길면 글자 단위로 한 번 더 끊는다.
    wrapped: list[str] = []
    for line in lines:
        if draw.textlength(line, font=font) <= max_w:
            wrapped.append(line)
            continue
        buf = ""
        for ch in line:
            if draw.textlength(buf + ch, font=font) <= max_w or not buf:
                buf += ch
            else:
                wrapped.append(buf)
                buf = ch
        if buf:
            wrapped.append(buf)
    return wrapped


def _shadowed(
    fx: ImageDraw.ImageDraw,
    text_draw: ImageDraw.ImageDraw,
    pos: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
) -> None:
    """그림자는 fx 레이어에, 선명한 글자는 text 레이어에 따로 그린다.

    z-순서(배경→그라데이션→그림자/칩→글자)를 지키려면 두 레이어를 나눠야 한다.
    """
    x, y = pos
    fx.text((x + SHADOW_OFFSET, y + SHADOW_OFFSET), text, font=font, fill=SHADOW_COLOR)
    text_draw.text((x, y), text, font=font, fill=fill)


def render_card(
    background_png: bytes,
    portrait_png: bytes,
    content: PersonaCardContent,
    qr_data: str,
) -> bytes:
    """완성된 페르소나 카드 PNG bytes 반환.

    레이어 합성 순서: 배경 → 그라데이션 → fx(그림자·칩) → 글자 → 인물 → QR.
    """
    bg = Image.open(BytesIO(background_png)).convert("RGBA")
    card = _fit_cover(bg, (CARD_W, CARD_H))
    card.alpha_composite(_gradient_overlay((CARD_W, CARD_H)))

    # 인물 타일 (나중에 얹음)
    box_h = int((1 - PORTRAIT_TOP - PORTRAIT_BOTTOM) * CARD_H)
    box_w = int(box_h * 2 / 3)
    portrait_x = int(PORTRAIT_LEFT * CARD_W)
    portrait_y = int(PORTRAIT_TOP * CARD_H)
    tile = _portrait_tile(portrait_png, (box_w, box_h))

    # 텍스트 영역 시작 X — 인물 오른쪽과 겹치지 않도록.
    portrait_right = portrait_x + box_w + 2 * PORTRAIT_BORDER
    text_left = max(int(0.30 * CARD_W), portrait_right + int(TEXT_GAP_FROM_PORTRAIT * CARD_W))
    text_right = int(TEXT_RIGHT * CARD_W)
    text_max_w = text_right - text_left

    # fx: 그림자·칩 배경(반투명) / text: 선명한 흰 글자
    fx_layer = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    text_layer = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    fx = ImageDraw.Draw(fx_layer)
    td = ImageDraw.Draw(text_layer)

    y = int(TEXT_TOP * CARD_H)
    # 라벨
    label_font = _font("SemiBold", LABEL_SIZE)
    _shadowed(fx, td, (text_left, y), content.label, label_font, LABEL_COLOR)
    y += LABEL_SIZE + 14

    # 타이틀 (줄바꿈)
    title_font = _font("Bold", TITLE_SIZE)
    for line in _wrap(td, content.title, title_font, text_max_w):
        _shadowed(fx, td, (text_left, y), line, title_font, WHITE)
        y += int(TITLE_SIZE * 1.18)

    # 태그라인
    if content.tagline:
        y += 6
        tagline_font = _font("Regular", TAGLINE_SIZE)
        for line in _wrap(td, content.tagline, tagline_font, text_max_w):
            _shadowed(fx, td, (text_left, y), line, tagline_font, TAGLINE_COLOR)
            y += int(TAGLINE_SIZE * 1.3)

    # 키워드 칩
    if content.keywords:
        y += 18
        kw_font = _font("SemiBold", KEYWORD_SIZE)
        chip_pad_x, chip_pad_y, gap = 18, 9, 12
        chip_h = KEYWORD_SIZE + 2 * chip_pad_y
        cx, cy = text_left, y
        for kw in content.keywords:
            text = kw if kw.startswith("#") else f"#{kw}"
            chip_w = int(td.textlength(text, font=kw_font)) + 2 * chip_pad_x
            if cx + chip_w > text_right and cx > text_left:
                cx = text_left
                cy += chip_h + gap
            fx.rounded_rectangle(
                (cx, cy, cx + chip_w, cy + chip_h), radius=chip_h // 2, fill=CHIP_BG
            )
            td.text((cx + chip_pad_x, cy + chip_pad_y), text, font=kw_font, fill=WHITE)
            cx += chip_w + gap

    card.alpha_composite(fx_layer)
    card.alpha_composite(text_layer)
    card.alpha_composite(tile, dest=(portrait_x, portrait_y))

    qr_size = int(QR_SIZE_RATIO * CARD_W)
    qr_x = CARD_W - int(QR_MARGIN_RIGHT * CARD_W) - qr_size
    qr_y = CARD_H - int(QR_MARGIN_BOTTOM * CARD_H) - qr_size
    card.alpha_composite(_qr_tile(qr_data, qr_size), dest=(qr_x, qr_y))

    out = BytesIO()
    card.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
