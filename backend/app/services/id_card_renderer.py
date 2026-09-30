"""세로형 페르소나 카드 합성 (Pillow) — 인쇄용 PNG.

생성 인물 이미지 한 장 위에 로고·QR·이름·학교/학년반번호를 얹고, 하단 흰 영역에
headline(윗줄)·base_career(아랫줄)를 쓴다. 글자는 AI가 아니라 여기서 그린다 —
한글이 깨지지 않고, 문구를 고쳐도 이미지를 다시 만들 필요가 없다.

인물 배치는 이미지 생성 프롬프트(future_photo_prompt)가 정한다. 여기서는 생성 이미지를
위쪽 기준으로 채울 뿐이라(4:5 이미지는 좌우가 약 3%씩 잘림), 이미지 좌표가 곧 카드 좌표다.

비율은 세로 신용카드(54x86mm). 폭 1024px ≈ 480dpi.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import qrcode  # type: ignore[import-untyped]  # 타입 스텁 없음
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

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
QR_RIGHT, QR_Y, QR_W = 0.052, 0.041, 0.132  # QR_W: 0.11의 1.2배

# 이름·학교 줄 뒤: 아래로 갈수록 흐려지는 블러(BLUR_TOP 선명 → BLUR_FULL부터 최대 블러).
# 그 아래에서 흰색이 차올라 사진 → 이름 줄 → 하단 흰 영역이 끊김 없이 이어진다.
BLUR_TOP = 0.66
BLUR_FULL = 0.80
BLUR_RADIUS = 28  # px, 최대 블러 세기
# 흰 페이드는 길게 — 짧으면 어두운 옷과 흰 영역 사이에 경계선이 보인다.
WHITE_FADE_TOP = 0.74
PHOTO_BOTTOM = 0.83  # 여기부터 완전한 흰 영역 (headline 윗선 ≈ 0.833 아래로 내리지 않는다)

NAME_X, NAME_Y, NAME_SIZE = 0.059, 0.716, 0.116
SCHOOL_RIGHT, SCHOOL_Y, CLASS_Y, SCHOOL_SIZE = 0.076, 0.7065, 0.7375, 0.038
HEADLINE_Y, HEADLINE_SIZE = 0.856, 0.066
CAREER_Y, CAREER_SIZE = 0.923, 0.135
CAREER_FONT = "Paperlogy-8ExtraBold.ttf"

INK = (17, 17, 17, 255)
SUB_INK = (51, 51, 51, 255)
WHITE = (255, 255, 255, 255)
# 이름·학교 글씨 뒤 번진 그림자 — 생성 사진의 남색 재킷(future_photo_prompt)과 같은 계열.
SHADOW = (28, 36, 68, 220)
SHADOW_BLUR = 10  # px


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
def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_FONT_DIR / name), size)


def _fit_font(text: str, name: str, size: int, max_width: float) -> ImageFont.FreeTypeFont:
    """폭을 넘으면 넘지 않을 때까지 글자 크기를 줄인다(직업명 길이가 제각각이라)."""
    while size > 12 and _font(name, size).getlength(text) > max_width:
        size -= 2
    return _font(name, size)


@lru_cache(maxsize=1)
def _logo(width: int) -> Image.Image:
    logo = Image.open(LOGO_IMAGE).convert("RGBA")
    return logo.resize((width, round(logo.height * width / logo.width)), Image.Resampling.LANCZOS)


def _gradient(
    size: tuple[int, int], top: int, full: int, rgb: tuple[int, int, int], alpha: int
) -> Image.Image:
    """top(투명)에서 full(alpha)까지 짙어지고 그 아래는 유지되는 전체 폭 세로 그라데이션."""
    w, h = size
    layer = Image.new("RGBA", size, (*rgb, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(top, h):
        t = min(1.0, (y - top) / (full - top))
        draw.line([(0, y), (w, y)], fill=(*rgb, int(alpha * t * t * (3 - 2 * t))))
    return layer


_Text = tuple[tuple[float, float], str, ImageFont.FreeTypeFont, str]  # xy, 글자, 폰트, anchor


def _white_texts(card: Image.Image, texts: list[_Text]) -> None:
    """사진 위 흰 글씨. 뒤에 남색 그림자를 번지게 깔아 밝은 사진 위에서도 읽히게 한다."""
    shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    for xy, text, font, anchor in texts:
        shadow_draw.text(
            xy, text, font=font, fill=SHADOW, anchor=anchor, stroke_width=4, stroke_fill=SHADOW
        )
    card.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR)))
    draw = ImageDraw.Draw(card)
    for xy, text, font, anchor in texts:
        draw.text(xy, text, font=font, fill=WHITE, anchor=anchor)


def _qr(data: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(data)
    qr.make(fit=True)
    # 흰 바탕 없이 검은 모듈만 — 사진 배경(밝은 회색 고정, future_photo_prompt)이 바탕 역할을 한다.
    modules = qr.make_image(fill_color="black", back_color="white").convert("L")
    alpha = ImageOps.invert(modules).resize((size, size), Image.Resampling.NEAREST)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    img.putalpha(alpha)
    return img


def render_id_card(image_png: bytes | None, content: IdCardContent) -> bytes:
    """인물 이미지(없으면 폴백 캐릭터) + 카드 문구 → 카드 PNG bytes."""
    W, H = CARD_W, CARD_H
    photo_h = round(H * PHOTO_BOTTOM)
    card = Image.new("RGBA", (W, H), WHITE)

    # ── 인물 + 이름 줄 그라데이션 + 하단 흰 페이드 ──
    # 폴백도 생성 사진과 같은 4:5 구도라 같은 방식으로 꽉 채운다.
    source = Image.open(BytesIO(image_png) if image_png is not None else FALLBACK_IMAGE)
    # 위쪽 기준으로 채운다 — 정수리 여백을 지키고 넘치는 부분은 아래(가슴)에서 뺀다.
    photo = ImageOps.fit(
        source.convert("RGBA"), (W, photo_h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.0)
    )
    size = photo.size
    # 블러본을 세로 마스크(위 투명 → 아래 불투명)로 섞어 아래로 갈수록 흐려지게 한다.
    blur_mask = _gradient(size, round(H * BLUR_TOP), round(H * BLUR_FULL), (0, 0, 0), 255)
    photo = Image.composite(
        photo.filter(ImageFilter.GaussianBlur(BLUR_RADIUS)), photo, blur_mask.getchannel("A")
    )
    photo.alpha_composite(_gradient(size, round(H * WHITE_FADE_TOP), photo_h, (255, 255, 255), 255))
    card.alpha_composite(photo)
    draw = ImageDraw.Draw(card)

    # ── 헤더: 로고(좌) · QR(우) ──
    card.alpha_composite(_logo(round(W * LOGO_W)), (round(W * LOGO_X), round(H * LOGO_Y)))
    qr = round(W * QR_W)
    card.alpha_composite(_qr(content.qr_data, qr), (W - round(W * QR_RIGHT) - qr, round(H * QR_Y)))

    # ── 이름(좌) ──
    name_font = _fit_font(
        content.student_name, "Paperlogy-6SemiBold.ttf", round(W * NAME_SIZE), W * 0.5
    )

    # ── 학교 / 학년·반·번호(우) — 두 줄 같은 굵기 ──
    right = W - W * SCHOOL_RIGHT
    school_font = _font("Paperlogy-4Regular.ttf", round(W * SCHOOL_SIZE))
    class_text = f"{content.grade}학년 {content.class_no}반 {content.student_no}번"
    _white_texts(
        card,
        [
            ((W * NAME_X, H * NAME_Y), content.student_name, name_font, "lm"),
            ((right, H * SCHOOL_Y), content.school, school_font, "rm"),
            ((right, H * CLASS_Y), class_text, school_font, "rm"),
        ],
    )

    # ── 하단: headline(윗줄) + base_career(아랫줄, 크게) ──
    max_w = W * 0.9
    if content.headline:
        draw.text(
            (W / 2, H * HEADLINE_Y),
            content.headline,
            font=_fit_font(
                content.headline, "Paperlogy-6SemiBold.ttf", round(W * HEADLINE_SIZE), max_w
            ),
            fill=SUB_INK,
            anchor="mm",
        )
        career_y = H * CAREER_Y
    else:
        career_y = H * (HEADLINE_Y + CAREER_Y) / 2
    draw.text(
        (W / 2, career_y),
        content.base_career,
        font=_fit_font(content.base_career, CAREER_FONT, round(W * CAREER_SIZE), max_w),
        fill=INK,
        anchor="mm",
    )

    out = BytesIO()
    card.convert("RGB").save(out, format="PNG", dpi=(480, 480))
    return out.getvalue()
