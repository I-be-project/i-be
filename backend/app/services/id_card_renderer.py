"""세로형 페르소나 카드 합성 (Pillow) — 인쇄용 PNG.

생성 인물 이미지 한 장 위에 로고·QR·이름·학교/학년반번호를 얹고, 하단 흰 띠에
headline(윗줄)·base_career(아랫줄)를 쓴다. 글자는 AI가 아니라 여기서 그린다 —
한글이 깨지지 않고, 문구를 고쳐도 이미지를 다시 만들 필요가 없다.

비율은 세로 신용카드(54x86mm). 폭 1024px ≈ 480dpi.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import qrcode  # type: ignore[import-untyped]  # 타입 스텁 없음
from PIL import Image, ImageDraw, ImageFont, ImageOps

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_FONT_DIR = _ASSETS / "fonts"
# 생성 이미지가 없을 때(사진 없음·얼굴 없는 사진으로 codex 거절·검수자가 폴백 선택) 쓰는 캐릭터.
FALLBACK_IMAGE = _ASSETS / "card" / "fallback.png"

CARD_W = 1024
CARD_H = round(CARD_W * 86 / 54)  # 1631

# 하단 흰 띠(문구 영역) 높이 비율. 나머지 위쪽이 인물 이미지.
TEXT_BAND = 0.2
MARGIN = 48

LOGO_TEXT = "나Be한마당"  # ponytail: 텍스트 로고. 로고 PNG가 오면 이미지로 교체
QR_SIZE = 150

WHITE = (255, 255, 255, 255)
INK = (20, 20, 24, 255)
SUB_INK = (60, 60, 68, 255)
SHADOW = (0, 0, 0, 160)


@dataclass(frozen=True)
class IdCardContent:
    student_name: str
    school: str
    grade: int
    class_no: int
    student_no: int
    headline: str
    base_career: str
    qr_data: str


@lru_cache(maxsize=16)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_FONT_DIR / f"Pretendard-{weight}.otf"), size)


def _fit_font(text: str, weight: str, size: int, max_width: int) -> ImageFont.FreeTypeFont:
    """폭을 넘으면 넘지 않을 때까지 글자 크기를 줄인다(직업명 길이가 제각각이라)."""
    while size > 12 and _font(weight, size).getlength(text) > max_width:
        size -= 2
    return _font(weight, size)


def _shadow_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    anchor: str,
) -> None:
    draw.text((xy[0] + 2, xy[1] + 2), text, font=font, fill=SHADOW, anchor=anchor)
    draw.text(xy, text, font=font, fill=WHITE, anchor=anchor)


def _bottom_fade(size: tuple[int, int], height: int) -> Image.Image:
    """이미지 하단을 어둡게 — 이름·학교 글자가 어떤 배경에서도 읽히게."""
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(height):
        alpha = int(170 * (i / height) ** 1.5)
        draw.line([(0, h - height + i), (w, h - height + i)], fill=(0, 0, 0, alpha))
    return layer


def _qr(data: str) -> Image.Image:
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    resized: Image.Image = img.resize((QR_SIZE, QR_SIZE), Image.Resampling.NEAREST)
    return resized


def _fallback_photo(size: tuple[int, int]) -> Image.Image:
    """폴백 캐릭터를 흰 바탕 가운데에 비율 유지로 앉힌다(원본이 작아 꽉 채우면 흐려진다)."""
    w, h = size
    canvas = Image.new("RGBA", size, WHITE)
    char = Image.open(FALLBACK_IMAGE).convert("RGBA")
    scale = min(w * 0.85 / char.width, h * 0.7 / char.height)
    char = char.resize(
        (int(char.width * scale), int(char.height * scale)), Image.Resampling.LANCZOS
    )
    canvas.alpha_composite(char, ((w - char.width) // 2, int(h * 0.12)))
    return canvas


def render_id_card(image_png: bytes | None, content: IdCardContent) -> bytes:
    """인물 이미지(없으면 폴백 캐릭터) + 카드 문구 → 카드 PNG bytes."""
    photo_h = round(CARD_H * (1 - TEXT_BAND))
    card = Image.new("RGBA", (CARD_W, CARD_H), WHITE)

    if image_png is None:
        photo = _fallback_photo((CARD_W, photo_h))
    else:
        # 위는 자르지 않는다 — 정수리 여백을 지키고, 넘치는 부분은 이름 띠에 가려지는 가슴 쪽에서 뺀다.
        photo = ImageOps.fit(
            Image.open(BytesIO(image_png)).convert("RGBA"),
            (CARD_W, photo_h),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.0),
        )
    photo.alpha_composite(_bottom_fade(photo.size, photo_h // 3))
    card.alpha_composite(photo)

    draw = ImageDraw.Draw(card)
    _shadow_text(draw, (MARGIN, MARGIN), LOGO_TEXT, _font("Bold", 56), "la")
    card.alpha_composite(_qr(content.qr_data), (CARD_W - MARGIN - QR_SIZE, MARGIN))

    # 이름(좌) · 학교/학년반번호(우) — 이미지 하단 위에.
    base_y = photo_h - MARGIN
    _shadow_text(
        draw,
        (MARGIN, base_y),
        content.student_name,
        _fit_font(content.student_name, "Bold", 96, CARD_W // 2),
        "ls",
    )
    right = CARD_W - MARGIN
    _shadow_text(
        draw,
        (right, base_y),
        f"{content.grade}학년 {content.class_no}반 {content.student_no}번",
        _font("SemiBold", 40),
        "rs",
    )
    _shadow_text(
        draw,
        (right, base_y - 56),
        content.school,
        _fit_font(content.school, "SemiBold", 40, CARD_W // 2 - MARGIN),
        "rs",
    )

    # 하단 흰 띠: headline(윗줄) + base_career(아랫줄, 크게).
    band_top = photo_h
    band_h = CARD_H - photo_h
    max_w = CARD_W - MARGIN * 2
    cx = CARD_W // 2
    if content.headline:
        draw.text(
            (cx, band_top + band_h * 0.33),
            content.headline,
            font=_fit_font(content.headline, "SemiBold", 52, max_w),
            fill=SUB_INK,
            anchor="mm",
        )
        career_y = band_top + band_h * 0.68
    else:
        career_y = band_top + band_h * 0.5
    draw.text(
        (cx, career_y),
        content.base_career,
        font=_fit_font(content.base_career, "Bold", 104, max_w),
        fill=INK,
        anchor="mm",
    )

    out = BytesIO()
    card.convert("RGB").save(out, format="PNG", dpi=(480, 480))
    return out.getvalue()
