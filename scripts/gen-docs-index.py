#!/usr/bin/env python3
"""docs/issues/README.md 색인을 생성한다.

각 이슈 문서의 프론트매터(date·kind·area·tags)를 읽어 날짜 역순 표로 만든다.
표준 라이브러리만 쓴다 — 문서 색인 하나 만들자고 의존성을 늘리지 않는다.

사용법:
    python3 scripts/gen-docs-index.py            # 색인 갱신
    python3 scripts/gen-docs-index.py --check    # 갱신 필요 여부만 확인 (CI용)
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ISSUES_DIR = Path(__file__).resolve().parent.parent / "docs" / "issues"
INDEX_FILE = ISSUES_DIR / "README.md"

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)

HEADER = """# 이슈 기록

개발하면서 삽질한 것과 인프라 판단을 남긴다. 기준은 **코드와 커밋만 봐서는
복원할 수 없는 맥락인가**다. 자세한 규칙은 [`../README.md`](../README.md) 참고.

> 이 표는 `scripts/gen-docs-index.py`가 생성한다. 직접 고치지 말고 스크립트를 다시 실행한다.
"""

FOOTER = """
## 새 기록 남기기

1. `docs/issues/YYYY-MM-DD-<한국어-슬러그>.md` 생성
2. 프론트매터(`date`·`kind`·`area`·`tags`·`commits`)와 본문 4섹션 작성
3. `python3 scripts/gen-docs-index.py` 실행해 이 표 갱신
"""


@dataclass
class Issue:
    path: Path
    date: str
    kind: str
    area: str
    tags: list[str]
    title: str


def parse_scalar(body: str, key: str) -> str:
    """프론트매터에서 단일 값을 읽는다. 없으면 빈 문자열."""
    match = re.search(rf"^{key}:\s*(.+?)\s*$", body, re.MULTILINE)
    if not match:
        return ""
    return match.group(1).strip().strip("\"'")


def parse_list(body: str, key: str) -> list[str]:
    """`key: [a, b]` 형태의 인라인 리스트를 읽는다."""
    match = re.search(rf"^{key}:\s*\[(.*?)\]\s*$", body, re.MULTILINE)
    if not match:
        return []
    return [item.strip().strip("\"'") for item in match.group(1).split(",") if item.strip()]


def load_issue(path: Path) -> Issue | None:
    """문서 하나를 읽는다. 형식이 어긋나면 경고하고 None을 돌려준다."""
    text = path.read_text(encoding="utf-8")

    frontmatter = FRONTMATTER_RE.match(text)
    if not frontmatter:
        warn(path, "프론트매터가 없다")
        return None

    body = frontmatter.group(1)
    date = parse_scalar(body, "date")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        warn(path, f"date가 YYYY-MM-DD 형식이 아니다: {date!r}")
        return None

    title_match = TITLE_RE.search(text[frontmatter.end() :])
    if not title_match:
        warn(path, "본문에 `# 제목`이 없다")
        return None

    return Issue(
        path=path,
        date=date,
        kind=parse_scalar(body, "kind") or "-",
        area=parse_scalar(body, "area") or "-",
        tags=parse_list(body, "tags"),
        title=title_match.group(1),
    )


def warn(path: Path, message: str) -> None:
    """색인에서 빠졌음을 알리되 중단하지는 않는다.

    색인 생성이 작업을 막으면 아무도 쓰지 않게 된다.
    """
    print(f"  건너뜀 {path.name}: {message}", file=sys.stderr)


def collect() -> list[Issue]:
    if not ISSUES_DIR.is_dir():
        print(f"{ISSUES_DIR} 가 없다", file=sys.stderr)
        return []

    issues = []
    for path in sorted(ISSUES_DIR.glob("*.md")):
        if path.name == "README.md":
            continue
        issue = load_issue(path)
        if issue:
            issues.append(issue)

    # 날짜 역순. 같은 날짜면 파일명순으로 안정 정렬한다.
    issues.sort(key=lambda i: (i.date, i.path.name), reverse=True)
    return issues


def render(issues: list[Issue]) -> str:
    lines = [HEADER]

    if not issues:
        lines.append("\n아직 기록이 없다.\n")
        lines.append(FOOTER)
        return "".join(lines)

    lines.append(f"\n전체 {len(issues)}건.\n\n")
    lines.append("| 날짜 | 제목 | 종류 | 영역 | 태그 |\n")
    lines.append("|---|---|---|---|---|\n")
    for issue in issues:
        tags = ", ".join(issue.tags) if issue.tags else "-"
        lines.append(
            f"| {issue.date} | [{issue.title}]({issue.path.name}) "
            f"| {issue.kind} | {issue.area} | {tags} |\n"
        )
    lines.append(FOOTER)
    return "".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="이슈 기록 색인 생성")
    parser.add_argument(
        "--check",
        action="store_true",
        help="파일을 쓰지 않고 갱신이 필요한지만 확인한다 (필요하면 종료 코드 1)",
    )
    args = parser.parse_args()

    issues = collect()
    content = render(issues)
    current = INDEX_FILE.read_text(encoding="utf-8") if INDEX_FILE.exists() else ""

    if args.check:
        if content != current:
            print("색인이 최신이 아니다. `python3 scripts/gen-docs-index.py` 실행 필요.")
            return 1
        print(f"색인 최신 ({len(issues)}건)")
        return 0

    if content == current:
        print(f"변경 없음 ({len(issues)}건)")
        return 0

    INDEX_FILE.write_text(content, encoding="utf-8")
    print(f"{INDEX_FILE.relative_to(INDEX_FILE.parent.parent.parent)} 갱신 ({len(issues)}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
