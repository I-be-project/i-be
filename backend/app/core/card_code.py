"""카드 QR용 학생 코드.

부스 코드와 같은 알파벳(혼동 문자 제외)을 쓴다. 공개 페이지 주소라 추측이 어려워야 해서
8자로 둔다 — 31^8 ≈ 8,500억 조합. 6자(약 8.9억)는 대량 요청으로 훑을 수 있는 수준이다.
"""

from __future__ import annotations

import re
import secrets

from app.core.booth_code import BOOTH_CODE_ALPHABET

CARD_CODE_LENGTH = 8
_CARD_CODE_RE = re.compile(f"[{BOOTH_CODE_ALPHABET}]{{{CARD_CODE_LENGTH}}}")


def generate_card_code() -> str:
    return "".join(secrets.choice(BOOTH_CODE_ALPHABET) for _ in range(CARD_CODE_LENGTH))


def is_card_code(code: str) -> bool:
    return _CARD_CODE_RE.fullmatch(code) is not None
