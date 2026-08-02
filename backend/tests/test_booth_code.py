"""부스 코드 생성 — 길이·알파벳·혼동 문자 제외 검증."""

from __future__ import annotations

from app.core.booth_code import (
    BOOTH_CODE_ALPHABET,
    BOOTH_CODE_LENGTH,
    generate_booth_code,
)


def test_generated_code_has_fixed_length() -> None:
    assert len(generate_booth_code()) == BOOTH_CODE_LENGTH


def test_generated_code_uses_only_allowed_alphabet() -> None:
    for _ in range(200):
        assert set(generate_booth_code()) <= set(BOOTH_CODE_ALPHABET)


def test_alphabet_excludes_confusable_characters() -> None:
    """인쇄물을 보고 손으로 입력할 수 있어야 하므로 0/O, 1/I/L을 뺀다."""
    for ch in "01OIL":
        assert ch not in BOOTH_CODE_ALPHABET


def test_generated_codes_are_not_repeated() -> None:
    """31^6 ≈ 8.9억 조합이라 100개를 뽑아 겹칠 확률은 무시할 수준이다."""
    codes = {generate_booth_code() for _ in range(100)}
    assert len(codes) == 100
