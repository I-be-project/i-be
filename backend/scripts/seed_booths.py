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

CSV 형식(헤더 필수): code,program_id,zone,name,description,detail,competencies
  code          발급된 6자 부스 코드. 새 부스는 비워 둔다
  program_id    노션 프로그램ID(NB26-xxx). 스크립트는 읽지 않는다 — 노션과 대조용
  zone          F·L·Y·C 중 하나, 존이 없는 부스는 비워 둔다
  name          부스 이름
  description   운영기관
  detail        학생용 설명
  competencies  역량 키를 ;로 이어 쓴다

CSV는 노션 「공식 부스 마스터」 내용을 옮긴 것이다. 노션이 원본이다.

code가 있으면 그 부스를 찾아 이름·설명·존·역량을 CSV 값으로 맞춘다. code가 없으면
이름으로 찾고, 그래도 없으면 새로 등록한다. 새로 발급된 code는 노션 DB부스ID 칸에
옮겨 적어야 다음 실행에서 code로 매칭된다(이름이 바뀌어도 중복 등록되지 않는다).
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

# 직업체험 부스는 역량 3개, 역량체험 부스는 1개, 존 없는 부스(기타)는 0개.
_REQUIRED_COUNT = {"F": 3, "L": 3, "Y": 3, "C": 1, "": 0}


@dataclass(frozen=True, slots=True)
class BoothRow:
    """CSV 한 줄."""

    zone: str
    name: str
    description: str
    competencies: list[str] = field(default_factory=list)
    code: str = ""
    detail: str = ""


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
                    code=(raw.get("code") or "").strip().upper(),
                    detail=(raw.get("detail") or "").strip(),
                )
            )
    return rows


def check_competencies(rows: list[BoothRow]) -> list[str]:
    """zone과 역량 칸을 검사해 문제를 문자열 목록으로 돌려준다. 문제가 없으면 빈 목록이다.

    요청 전에 모두 막는다 — 등록 요청 중간에 서버가 422로 죽으면 그때까지 만든 부스가
    남는다(삭제하면 인쇄한 QR이 무효가 되니 되돌리기 비싸다). 역량은 존별 개수를 정확히
    맞춰야 한다 — 비어 있으면 갱신 시 기존 역량이 지워진다.
    """
    problems = []
    for index, row in enumerate(rows, start=2):  # 2 = 헤더 다음 줄
        if row.zone not in _REQUIRED_COUNT:
            problems.append(f"{index}행 '{row.name}': 알 수 없는 zone '{row.zone}'")
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
                "detail": row.detail or None,
                "zone": row.zone,
                "competencies": row.competencies,
            },
        )
        res.raise_for_status()
        return dict(res.json())

    def update(self, booth_id: str, changes: dict[str, Any]) -> None:
        res = self._http.patch(
            f"/api/admin/booths/{booth_id}", headers=self._headers(), json=changes
        )
        res.raise_for_status()

    def close(self) -> None:
        self._http.close()


def diff(found: dict[str, Any], row: BoothRow) -> dict[str, Any]:
    """서버의 부스와 CSV 행이 다른 필드만 PATCH 본문으로 만든다. 같으면 빈 dict."""
    want: dict[str, Any] = {
        "name": row.name,
        "description": row.description or None,
        "detail": row.detail or None,
        "zone": row.zone,
    }
    changes = {k: v for k, v in want.items() if found.get(k) != v}
    # 서버는 역량을 사전순으로 돌려준다(booth_repo.py의 array_agg ... order by).
    # CSV는 자연 순서라 list 비교는 갱신 후에도 영원히 "다르다"로 오판한다.
    if sorted(found.get("competencies") or []) != sorted(row.competencies):
        changes["competencies"] = row.competencies
    return changes


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
        booths = client.booths()
        by_code = {str(b["code"]): b for b in booths}
        by_name = {str(b["name"]): b for b in booths}

        created = updated = skipped = missing = 0
        for row in rows:
            if row.code:
                found = by_code.get(row.code)
                if found is None:
                    # 오타난 code로 새 부스를 만들면 인쇄된 QR과 어긋난다 — 등록하지 않는다.
                    print(f"[없는 code] {row.code} {row.name}", file=sys.stderr)
                    missing += 1
                    continue
            else:
                found = by_name.get(row.name)
            if found is None:
                if args.dry_run:
                    print(f"[등록 예정] {row.zone} {row.name}")
                else:
                    made = client.create(row)
                    print(f"[등록] {row.zone} {row.name} → {made['code']}")
                created += 1
                continue

            changes = diff(found, row)
            if changes:
                label = f"{found['code']} {found['name']}"
                if args.dry_run:
                    print(f"[갱신 예정] {label} → {changes}")
                else:
                    client.update(str(found["id"]), changes)
                    print(f"[갱신] {label} → {changes}")
                updated += 1
                continue

            skipped += 1

        prefix = "(dry-run) " if args.dry_run else ""
        print(
            f"\n{prefix}등록 {created}건 · 갱신 {updated}건 · 건너뜀 {skipped}건"
            f" · 없는 code {missing}건"
        )
        return 1 if missing else 0
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = " (아이디/비밀번호 확인)" if status == 401 else ""
        print(f"요청 실패 {status}{hint}: {exc.response.text[:200]}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="부스 명단 CSV를 관리자 API로 일괄 등록")
    # 기본값을 운영 서버로 두면 플래그를 빠뜨렸을 때 조용히 운영에 부스가 생긴다.
    # 부스 삭제는 인쇄된 QR을 무효화하므로 되돌리기 비싸다 — 매번 명시하게 한다.
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--csv", default="scripts/booths.csv")
    parser.add_argument(
        "--dry-run", action="store_true", help="무엇이 바뀔지만 출력하고 바꾸지 않는다"
    )
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
