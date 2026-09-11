"""부스 명단 CSV를 관리자 API로 일괄 등록한다.

서버 코드에 의존하지 않고 HTTP만 쓴다. DB에 직접 붙지 않는 이유는 6자 코드 발급이다 —
코드는 혼동 문자를 뺀 랜덤 값이고 충돌 시 재시도까지 서버가 처리한다. SQL로 값을 박으면
그 로직을 우회하게 되고, 인쇄물과 DB가 어긋날 여지가 생긴다.

Usage:
  uv run python -m scripts.seed_booths \\
      --base-url https://api.cnu-likelion.kr \\
      --username admin --password '<비밀번호>' \\
      --csv scripts/booths.csv

옵션:
  --dry-run  무엇이 등록·갱신될지만 출력하고 아무것도 바꾸지 않는다

CSV 형식(헤더 필수): zone,name,description,competencies
  zone          F·L·Y·C 중 하나
  name          부스 이름 — 직업체험은 체험주제, 역량체험은 부스명
  description   직업체험은 기관명, 역량체험은 미션 활동
  competencies  역량 키를 ;로 이어 쓴다. 주최측 매핑 자료가 오기 전에는 비워 둔다

이미 등록된 부스는 **이름으로** 판별해 건너뛴다(체험주제 57개는 서로 모두 다르다).
건너뛴 부스도 역량 칸이 채워져 있으면 역량만 갱신한다 — 자료가 왔을 때 CSV의 역량 칸을
채워 다시 돌리면 끝나게 하기 위함이다. 이름·설명·존은 갱신하지 않는다(관리자 화면에서 고친다).
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

# app.core.competencies와 같은 목록이다. 스크립트는 서버 코드에 의존하지 않으므로 복사해 둔다.
COMPETENCY_KEYS = (
    "communication",
    "creativity",
    "analysis",
    "challenge",
    "empathy",
    "collaboration",
    "thinking",
    "judgment",
    "self_understanding",
    "planning",
)

# 직업체험 부스는 역량 3개, 역량체험 부스는 1개.
_REQUIRED_COUNT = {"F": 3, "L": 3, "Y": 3, "C": 1}


@dataclass(frozen=True, slots=True)
class BoothRow:
    """CSV 한 줄."""

    zone: str
    name: str
    description: str
    competencies: list[str] = field(default_factory=list)


def read_rows(path: Path) -> list[BoothRow]:
    """CSV를 읽는다. 앞뒤 공백은 떼고, 역량은 ;로 나눈다."""
    with path.open(encoding="utf-8", newline="") as fp:
        rows = []
        for raw in csv.DictReader(fp):
            competencies = [c.strip() for c in (raw.get("competencies") or "").split(";")]
            rows.append(
                BoothRow(
                    zone=(raw.get("zone") or "").strip(),
                    name=(raw.get("name") or "").strip(),
                    description=(raw.get("description") or "").strip(),
                    competencies=[c for c in competencies if c],
                )
            )
    return rows


def check_competencies(rows: list[BoothRow]) -> list[str]:
    """역량 칸을 검사해 문제를 문자열 목록으로 돌려준다. 비어 있으면 통과다.

    비어 있는 것을 통과시키는 이유: 주최측 매핑 자료가 오기 전 상태가 그렇다.
    한 줄이라도 채워져 있으면 그 줄은 개수와 키를 모두 만족해야 한다.
    """
    problems = []
    for index, row in enumerate(rows, start=2):  # 2 = 헤더 다음 줄
        if not row.competencies:
            continue
        unknown = [c for c in row.competencies if c not in COMPETENCY_KEYS]
        if unknown:
            problems.append(f"{index}행 '{row.name}': 알 수 없는 역량 {', '.join(unknown)}")
        required = _REQUIRED_COUNT.get(row.zone)
        if required is not None and len(row.competencies) != required:
            problems.append(
                f"{index}행 '{row.name}': {row.zone}존은 역량 {required}개여야 하는데 "
                f"{len(row.competencies)}개다"
            )
    return problems


class AdminClient:
    """관리자 API 클라이언트 — 로그인 토큰을 보관하고 요청에 실어 보낸다."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,  # 테스트에서 가짜 전송 주입용
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout, transport=transport
        )
        self._token: str | None = None

    def login(self, username: str, password: str) -> None:
        res = self._http.post("/api/admin/login", json={"username": username, "password": password})
        res.raise_for_status()
        # 응답 키는 admin_token이다(app/schemas/admin.py AdminLoginResponse).
        self._token = str(res.json()["admin_token"])

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    def booths(self) -> list[dict[str, Any]]:
        res = self._http.get("/api/admin/booths", headers=self._headers())
        res.raise_for_status()
        return list(res.json())

    def create(self, row: BoothRow) -> dict[str, Any]:
        res = self._http.post(
            "/api/admin/booths",
            headers=self._headers(),
            json={
                "name": row.name,
                "description": row.description or None,
                "zone": row.zone,
                "competencies": row.competencies,
            },
        )
        res.raise_for_status()
        return dict(res.json())

    def set_competencies(self, booth_id: str, competencies: list[str]) -> None:
        res = self._http.patch(
            f"/api/admin/booths/{booth_id}",
            headers=self._headers(),
            json={"competencies": competencies},
        )
        res.raise_for_status()

    def close(self) -> None:
        self._http.close()


def run(args: argparse.Namespace, *, transport: httpx.BaseTransport | None = None) -> int:
    rows = read_rows(Path(args.csv))
    if not rows:
        print("CSV에 부스가 없다.", file=sys.stderr)
        return 1

    problems = check_competencies(rows)
    if problems:
        print("역량 칸에 문제가 있다. 고치고 다시 돌려라:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    client = AdminClient(args.base_url, transport=transport)
    try:
        client.login(args.username, args.password)
        existing = {str(b["name"]): b for b in client.booths()}

        created = updated = skipped = 0
        for row in rows:
            found = existing.get(row.name)
            if found is None:
                if args.dry_run:
                    print(f"[등록 예정] {row.zone} {row.name}")
                else:
                    made = client.create(row)
                    print(f"[등록] {row.zone} {row.name} → {made['code']}")
                created += 1
                continue

            if row.competencies and list(found.get("competencies") or []) != row.competencies:
                if args.dry_run:
                    print(f"[역량 갱신 예정] {row.name} → {', '.join(row.competencies)}")
                else:
                    client.set_competencies(str(found["id"]), row.competencies)
                    print(f"[역량 갱신] {row.name} → {', '.join(row.competencies)}")
                updated += 1
                continue

            skipped += 1

        prefix = "(dry-run) " if args.dry_run else ""
        print(f"\n{prefix}등록 {created}건 · 역량 갱신 {updated}건 · 건너뜀 {skipped}건")
        return 0
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = " (아이디/비밀번호 확인)" if status == 401 else ""
        print(f"요청 실패 {status}{hint}: {exc.response.text[:200]}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="부스 명단 CSV를 관리자 API로 일괄 등록")
    parser.add_argument("--base-url", default="https://api.cnu-likelion.kr")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--csv", default="scripts/booths.csv")
    parser.add_argument(
        "--dry-run", action="store_true", help="무엇이 바뀔지만 출력하고 바꾸지 않는다"
    )
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
