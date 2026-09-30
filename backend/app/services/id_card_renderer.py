"""세로형 페르소나 카드 합성 (Pillow) — 인쇄용 PNG.

생성 인물 이미지 한 장 위에 로고·QR·이름·학교/학년반번호를 얹고, 하단 흰 영역에
headline(윗줄)·base_career(아랫줄)를 쓴다. 글자는 AI가 아니라 여기서 그린다 —
한글이 깨지지 않고, 문구를 고쳐도 이미지를 다시 만들 필요가 없다.

인물 배치는 이미지 생성 프롬프트(future_photo_prompt)가 정한다. 여기서는 생성 이미지를
폭에 맞춰 위쪽 기준으로 채울 뿐이라(아래쪽 약 13%가 잘림), 이미지 좌표가 곧 카드 좌표다.

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
# 행사 전용 로고(frontend/public/logo-hanmadang.png와 같은 파일).
LOGO_IMAGE = _ASSETS / "card" / "logo.png"

CARD_W = 1024
CARD_H = round(CARD_W * 86 / 54)  # 1631

# ─── 레이아웃 — 디자인 시안 카드 실측값(카드 폭·높이 대비 비율) ──────────
LOGO_X, LOGO_Y, LOGO_W = 0.053, 0.037, 0.171
QR_RIGHT, QR_Y, QR_W = 0.052, 0.041, 0.11

# 이름·학교 줄 뒤: 전체 폭 검은 그라데이션(위 투명 → 아래 진함) 위에 흰 글씨.
# 그 아래에서 흰색이 차올라 사진 → 이름 줄 → 하단 흰 영역이 끊김 없이 이어진다.
ROW_FADE_TOP = 0.56
ROW_DARKEST = 0.715
ROW_ALPHA = 205  # 가장 짙을 때 불투명도(0~255)
WHITE_FADE_TOP = 0.755
PHOTO_BOTTOM = 0.80  # 여기부터 완전한 흰 영역

NAME_X, NAME_Y, NAME_SIZE = 0.059, 0.716, 0.116
SCHOOL_RIGHT, SCHOOL_Y, CLASS_Y, SCHOOL_SIZE = 0.076, 0.705, 0.739, 0.038
HEADLINE_Y, HEADLINE_SIZE = 0.854, 0.066
CAREER_Y, CAREER_SIZE = 0.925, 0.135

INK = (17, 17, 17, 255)
SUB_INK = (51, 51, 51, 255)
WHITE = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 120)


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


def _fit_font(text: str, weight: str, size: int, max_width: float) -> ImageFont.FreeTypeFont:
    """폭을 넘으면 넘지 않을 때까지 글자 크기를 줄인다(직업명 길이가 제각각이라)."""
    while size > 12 and _font(weight, size).getlength(text) > max_width:
        size -= 2
    return _font(weight, size)


@lru_cache(maxsize=1)
def _logo(width: int) -> Image.Image:
    logo = Image.open(LOGO_IMAGE).convert("RGBA")
    return logo.resize((width, round(logo.height * width / logo.width)), Image.Resampling.LANCZOS)


def _fallback_photo(size: tuple[int, int]) -> Image.Image:
    """폴백 캐릭터를 흰 바탕 가운데에 비율 유지로 앉힌다(원본이 작아 꽉 채우면 흐려진다)."""
    w, h = size
    canvas = Image.new("RGBA", size, WHITE)
    char = Image.open(FALLBACK_IMAGE).convert("RGBA")
    scale = min(w * 0.85 / char.width, h * 0.62 / char.height)
    char = char.resize(
        (int(char.width * scale), int(char.height * scale)), Image.Resampling.LANCZOS
    )
    canvas.alpha_composite(char, ((w - char.width) // 2, int(h * 0.12)))
    return canvas


def _gradient(
    size: tuple[int, int], top: int, full: int, rgb: tuple[int, int, int], alpha: int
) -> Image.Image:
    """top(투명)에서 full(alpha)까지 짙어지고 그 아래는 유지되는 전체 폭 세로 그라데이션."""
    w, h = size
    layer = Image.new("RGBA", size, (*rgb, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(top, h):
        t = min(1.0, (y - top) / (full - top))
        draw.line([(0, y), (w, y)], fill=(*rgb, int(alpha * t**1.3)))
    return layer


def _white_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    anchor: str,
) -> None:
    """그라데이션 위 흰 글씨. 옅은 그림자로 밝은 사진 위에서도 윤곽을 잡는다."""
    draw.text((xy[0] + 2, xy[1] + 2), text, font=font, fill=SHADOW, anchor=anchor)
    draw.text(xy, text, font=font, fill=WHITE, anchor=anchor)


def _qr(data: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    resized: Image.Image = img.resize((size, size), Image.Resampling.NEAREST)
    return resized


def render_id_card(image_png: bytes | None, content: IdCardContent) -> bytes:
    """인물 이미지(없으면 폴백 캐릭터) + 카드 문구 → 카드 PNG bytes."""
    W, H = CARD_W, CARD_H
    photo_h = round(H * PHOTO_BOTTOM)
    card = Image.new("RGBA", (W, H), WHITE)

    # ── 인물 + 이름 줄 그라데이션 + 하단 흰 페이드 ──
    if image_png is None:
        photo = _fallback_photo((W, photo_h))
    else:
        # 위쪽 기준으로 채운다 — 정수리 여백을 지키고 넘치는 부분은 아래(가슴)에서 뺀다.
        photo = ImageOps.fit(
            Image.open(BytesIO(image_png)).convert("RGBA"),
            (W, photo_h),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.0),
        )
    size = photo.size
    photo.alpha_composite(
        _gradient(size, round(H * ROW_FADE_TOP), round(H * ROW_DARKEST), (0, 0, 0), ROW_ALPHA)
    )
    photo.alpha_composite(_gradient(size, round(H * WHITE_FADE_TOP), photo_h, (255, 255, 255), 255))
    card.alpha_composite(photo)
    draw = ImageDraw.Draw(card)

    # ── 헤더: 로고(좌) · QR(우) ──
    card.alpha_composite(_logo(round(W * LOGO_W)), (round(W * LOGO_X), round(H * LOGO_Y)))
    qr = round(W * QR_W)
    card.alpha_composite(_qr(content.qr_data, qr), (W - round(W * QR_RIGHT) - qr, round(H * QR_Y)))

    # ── 이름(좌) ──
    _white_text(
        draw,
        (W * NAME_X, H * NAME_Y),
        content.student_name,
        _fit_font(content.student_name, "SemiBold", round(W * NAME_SIZE), W * 0.5),
        "lm",
    )

    # ── 학교 / 학년·반·번호(우) — 두 줄 같은 굵기 ──
    right = W - W * SCHOOL_RIGHT
    school_font = _font("Regular", round(W * SCHOOL_SIZE))
    _white_text(draw, (right, H * SCHOOL_Y), content.school, school_font, "rm")
    _white_text(
        draw,
        (right, H * CLASS_Y),
        f"{content.grade}학년 {content.class_no}반 {content.student_no}번",
        school_font,
        "rm",
    )

    # ── 하단: headline(윗줄) + base_career(아랫줄, 크게) ──
    max_w = W * 0.9
    if content.headline:
        draw.text(
            (W / 2, H * HEADLINE_Y),
            content.headline,
            font=_fit_font(content.headline, "Bold", round(W * HEADLINE_SIZE), max_w),
            fill=SUB_INK,
            anchor="mm",
        )
        career_y = H * CAREER_Y
    else:
        career_y = H * (HEADLINE_Y + CAREER_Y) / 2
    draw.text(
        (W / 2, career_y),
        content.base_career,
        font=_fit_font(content.base_career, "Black", round(W * CAREER_SIZE), max_w),
        fill=INK,
        anchor="mm",
    )

    out = BytesIO()
    card.convert("RGB").save(out, format="PNG", dpi=(480, 480))
    return out.getvalue()
