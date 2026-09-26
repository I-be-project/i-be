"""세로형 페르소나 카드 합성 (Pillow) — 인쇄용 PNG.

생성 인물 이미지 한 장 위에 로고·QR·이름·학교/학년반번호를 얹고, 하단 흰 영역에
headline(윗줄)·base_career(아랫줄)를 쓴다. 글자는 AI가 아니라 여기서 그린다 —
한글이 깨지지 않고, 문구를 고쳐도 이미지를 다시 만들 필요가 없다.

인물 배치: AI는 매번 얼굴 크기·위치를 다르게 그린다. 얼굴을 찾아(OpenCV Haar cascade)
기준 카드와 같은 크기·위치가 되도록 확대·이동해 모든 카드의 인물 배치를 통일한다.
기준값(FACE_*)은 디자인 레퍼런스 카드에 같은 검출기를 돌려 잰 값이다.

비율은 세로 신용카드(54x86mm). 폭 1024px ≈ 480dpi.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
import qrcode  # type: ignore[import-untyped]  # 타입 스텁 없음
from PIL import Image, ImageDraw, ImageFont, ImageOps

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_FONT_DIR = _ASSETS / "fonts"
# 생성 이미지가 없을 때(사진 없음·얼굴 없는 사진으로 codex 거절·검수자가 폴백 선택) 쓰는 캐릭터.
FALLBACK_IMAGE = _ASSETS / "card" / "fallback.png"

CARD_W = 1024
CARD_H = round(CARD_W * 86 / 54)  # 1631

# ─── 레이아웃 (카드 대비 비율, 레퍼런스 카드 실측) ─────────────
PHOTO_BOTTOM = 0.82  # 사진이 내려오는 끝. 그 아래는 흰 영역
# 이름·학교 줄: 카드 전체 폭에 위→아래로 짙어지는 어두운 그라데이션을 깔고,
# 그 아래에서 흰색으로 스며들게 해 사진 → 이름 줄 → 하단 흰 영역을 끊김 없이 잇는다.
ROW_FADE_TOP = 0.58  # 어두운 그라데이션 시작(투명)
ROW_DARKEST = 0.70  # 가장 짙은 지점
ROW_ALPHA = 170  # 가장 짙을 때 불투명도(0~255)
FADE_TOP = 0.745  # 여기부터 흰색이 차오른다

# 얼굴 박스(Haar 검출 영역, 이마~턱·볼~볼) 기준.
FACE_W = 0.39  # 카드 폭 대비
FACE_CX = 0.5  # 얼굴 중심 x
FACE_TOP = 0.19  # 얼굴 박스 상단 y

MARGIN = 0.05
LOGO_TEXT = "나Be한마당"  # ponytail: 텍스트 로고. 로고 PNG가 오면 이미지로 교체
QR_SIZE = 0.12  # 카드 폭 대비

NAME_X = 0.07
NAME_Y = 0.705
SCHOOL_Y = 0.686
CLASS_Y = 0.724
HEADLINE_Y = 0.858
CAREER_Y = 0.928

WHITE = (255, 255, 255, 255)
INK = (20, 20, 24, 255)
SUB_INK = (55, 55, 62, 255)
SHADOW = (0, 0, 0, 170)

_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"  # type: ignore[attr-defined]  # cv2.data 스텁 없음
)


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


def _shadow_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    anchor: str,
    *,
    on_light: bool = False,
) -> None:
    """사진 위 흰 글씨(그림자 포함). 흰 바탕(폴백 카드) 위에선 그림자 없는 어두운 글씨."""
    if on_light:
        draw.text(xy, text, font=font, fill=SUB_INK, anchor=anchor)
        return
    draw.text((xy[0] + 2, xy[1] + 2), text, font=font, fill=SHADOW, anchor=anchor)
    draw.text(xy, text, font=font, fill=WHITE, anchor=anchor)


def detect_face(img: Image.Image) -> tuple[int, int, int, int] | None:
    """가장 큰 정면 얼굴 박스 (x, y, w, h). 못 찾으면 None."""
    gray = cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2GRAY)
    min_side = min(img.size) // 8  # 옷 주름 등 작은 오검출을 거른다
    faces = _CASCADE.detectMultiScale(gray, 1.05, 5, minSize=(min_side, min_side))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return int(x), int(y), int(w), int(h)


def _place_person(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """얼굴이 기준 크기·위치에 오도록 확대·이동해 size 영역을 채운다.

    영역을 다 덮지 못할 만큼 작게 줄여야 하면(얼굴이 이미 기준보다 크게 생성됨)
    덮는 최소 배율에서 멈춘다 — 빈 공간을 만들지 않는 대신 그 카드만 얼굴이 조금 크다.
    얼굴을 못 찾으면 위쪽 기준으로 꽉 채운다.
    """
    w, h = size
    face = detect_face(img)
    if face is None:
        return ImageOps.fit(img, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.0))

    fx, fy, fw, _ = face
    cover = max(w / img.width, h / img.height)
    scale = max(FACE_W * CARD_W / fw, cover)
    sw, sh = round(img.width * scale), round(img.height * scale)
    # 목표 위치로 옮기되, 영역 밖으로 빈틈이 생기지 않게 가둔다.
    ox = min(0, max(w - sw, round(FACE_CX * CARD_W - (fx + fw / 2) * scale)))
    oy = min(0, max(h - sh, round(FACE_TOP * CARD_H - fy * scale)))
    canvas = Image.new("RGBA", size)
    canvas.paste(img.resize((sw, sh), Image.Resampling.LANCZOS), (ox, oy))
    return canvas


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


def _row_gradient(size: tuple[int, int]) -> Image.Image:
    """이름·학교 줄 뒤 전체 폭 어두운 그라데이션 — 흰 글씨가 어떤 사진 위에서도 읽히게."""
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    top, darkest = round(CARD_H * ROW_FADE_TOP), round(CARD_H * ROW_DARKEST)
    for y in range(top, h):
        t = min(1.0, (y - top) / (darkest - top))
        draw.line([(0, y), (w, y)], fill=(12, 12, 18, int(ROW_ALPHA * t**1.3)))
    return layer


def _white_fade(size: tuple[int, int], start: int) -> Image.Image:
    """start부터 아래로 흰색이 차오른다 — 사진이 하단 흰 영역으로 자연스럽게 이어지게."""
    w, h = size
    layer = Image.new("RGBA", size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(start, h):
        alpha = int(255 * ((y - start) / (h - start)) ** 1.2)
        draw.line([(0, y), (w, y)], fill=(255, 255, 255, alpha))
    return layer


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
    photo_size = (W, round(H * PHOTO_BOTTOM))
    card = Image.new("RGBA", (W, H), WHITE)

    if image_png is None:
        photo = _fallback_photo(photo_size)
    else:
        photo = _place_person(Image.open(BytesIO(image_png)).convert("RGBA"), photo_size)
    on_light = image_png is None  # 폴백 카드는 흰 바탕 — 어두운 띠 없이 어두운 글씨
    if not on_light:
        photo.alpha_composite(_row_gradient(photo_size))
    photo.alpha_composite(_white_fade(photo_size, round(H * FADE_TOP)))
    card.alpha_composite(photo)

    draw = ImageDraw.Draw(card)
    margin = round(W * MARGIN)
    _shadow_text(
        draw, (margin, margin), LOGO_TEXT, _font("Bold", round(W * 0.055)), "la", on_light=on_light
    )
    qr = round(W * QR_SIZE)
    card.alpha_composite(_qr(content.qr_data, qr), (W - margin - qr, margin))

    # 이름 — 좌측. 뒤의 전체 폭 그라데이션이 가독성을 맡는다.
    _shadow_text(
        draw,
        (W * NAME_X, H * NAME_Y),
        content.student_name,
        _fit_font(content.student_name, "Bold", round(W * 0.09), W * 0.45),
        "lm",
        on_light=on_light,
    )

    # 학교 / 학년·반·번호 — 우측 정렬.
    right = W - round(W * 0.07)
    _shadow_text(
        draw,
        (right, H * SCHOOL_Y),
        content.school,
        _fit_font(content.school, "SemiBold", round(W * 0.042), W * 0.5),
        "rm",
        on_light=on_light,
    )
    _shadow_text(
        draw,
        (right, H * CLASS_Y),
        f"{content.grade}학년 {content.class_no}반 {content.student_no}번",
        _font("SemiBold", round(W * 0.042)),
        "rm",
        on_light=on_light,
    )

    # 하단: headline(윗줄) + base_career(아랫줄, 크게).
    max_w = W * 0.9
    if content.headline:
        draw.text(
            (W / 2, H * HEADLINE_Y),
            content.headline,
            font=_fit_font(content.headline, "SemiBold", round(W * 0.066), max_w),
            fill=SUB_INK,
            anchor="mm",
        )
        career_y = H * CAREER_Y
    else:
        career_y = H * (HEADLINE_Y + CAREER_Y) / 2
    draw.text(
        (W / 2, career_y),
        content.base_career,
        font=_fit_font(content.base_career, "Bold", round(W * 0.13), max_w),
        fill=INK,
        anchor="mm",
    )

    out = BytesIO()
    card.convert("RGB").save(out, format="PNG", dpi=(480, 480))
    return out.getvalue()
