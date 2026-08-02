"""부스 코드 생성.

QR이 안 읽힐 때 학생이 인쇄물의 코드를 손으로 입력할 수 있어야 하므로,
혼동하기 쉬운 문자(0/O, 1/I/L)를 알파벳에서 제외한다.
"""

from __future__ import annotations

import secrets

BOOTH_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
BOOTH_CODE_LENGTH = 6


def generate_booth_code() -> str:
    """추측하기 어려운 6자 부스 코드 1개. 31^6 ≈ 8.9억 조합."""
    return "".join(secrets.choice(BOOTH_CODE_ALPHABET) for _ in range(BOOTH_CODE_LENGTH))
