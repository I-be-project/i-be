"""Pair Code별 Career Direction Pool — 페르소나 직업 탐색용 참고 사전.

원본은 career_direction_pool_v4.txt(「i-be Career Direction Pool v4.0」) 그대로다.
Pair별 블록([RI] 등)의 각 줄(anchor_jobs·work_modes·…)을 CAREER_POOLS로,
블록 밖의 사용 원칙을 POOL_GUIDE로 나눈다. 사전을 고칠 땐 txt만 바꾼다.

정답표가 아니다 — 배열 순서는 추천 순위가 아니고, Pool 밖 직업도 쓸 수 있다.
"""

from __future__ import annotations

import re
from pathlib import Path

_SOURCE = Path(__file__).with_name("career_direction_pool_v4.txt")
_DIVIDER = "=" * 72
_PAIR_HEADER = re.compile(r"^\[([RIASEC]{2})\]$")


def _parse(text: str) -> tuple[dict[str, list[str]], str]:
    pools: dict[str, list[str]] = {}
    guide: list[str] = []
    for section in text.split(_DIVIDER):
        lines = [ln.strip() for ln in section.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        if m := _PAIR_HEADER.match(lines[0]):
            body = lines[1:]
            # 마지막 Pair 블록 뒤에 사용 방식·원본 절이 구분선 없이 붙어 있다.
            tail = next((i for i, ln in enumerate(body) if ln.startswith("[")), len(body))
            pools[m.group(1)] = body[:tail]
            if body[tail:]:
                guide.append("\n".join(body[tail:]))
        else:
            guide.append("\n".join(lines))
    return pools, "\n\n".join(guide)


CAREER_POOLS, POOL_GUIDE = _parse(_SOURCE.read_text(encoding="utf-8"))
