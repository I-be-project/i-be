"""내보내기 API(/api/export/v1)로 학생 정보·설문·원본 사진·AI 생성 이미지를 내려받는 참조 구현.

서버 코드에 의존하지 않고 HTTP만 쓴다(외부 시스템에 그대로 복사해도 동작). 필요한 패키지: httpx.

Usage:
  EXPORT_API_KEY=<키> uv run python -m scripts.download_export \\
      --base-url https://api.cnu-likelion.kr --out ./export

  # 학생 1명만
  EXPORT_API_KEY=<키> uv run python -m scripts.download_export --student-id <UUID>

옵션:
  --key         내보내기 키 (생략 시 환경변수 EXPORT_API_KEY)
  --page-size   페이지당 학생 수 (기본 500, 최대 500)
  --no-images   이미지는 건너뛰고 데이터만

출력 — 학생마다 폴더 하나:
  <out>/<학생 id>/student.json    학생 데이터. 만료되는 URL 대신 같은 폴더의 파일명이 들어간다
                                    (photo_file, persona.image_file)
  <out>/<학생 id>/photo.<ext>     원본 사진
  <out>/<학생 id>/persona.<ext>   AI 생성 인물 이미지 (페르소나 결과)

다시 실행하면 이미 받은 이미지는 건너뛴다(S3 전송 비용 절약). 원본 사진은 id당 한 번,
AI 생성 이미지는 승인 시각(approved_at)이 이전 student.json과 달라졌을 때만 새로 받는다.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}


class ExportClient:
    def __init__(
        self,
        base_url: str,
        key: str,
        *,
        timeout: float = 60.0,
        transport: httpx.BaseTransport | None = None,  # 테스트에서 가짜 전송 주입용
    ) -> None:
        self._api = httpx.Client(
            base_url=base_url.rstrip("/") + "/api/export/v1",
            headers={"Authorization": f"Bearer {key}"},
            timeout=timeout,
            transport=transport,
        )
        # 이미지는 서명 URL이라 인증 헤더를 붙이지 않는다(붙이면 S3가 거부한다).
        self._files = httpx.Client(timeout=timeout, transport=transport, follow_redirects=True)

    def students(self, page_size: int) -> list[dict[str, Any]]:
        """next_cursor가 null이 될 때까지 전량 수집."""
        collected: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            params: dict[str, Any] = {"limit": page_size}
            if cursor:
                params["cursor"] = cursor
            res = self._api.get("/students", params=params)
            res.raise_for_status()
            body = res.json()
            collected.extend(body["items"])
            print(f"  학생 {len(collected)}명 받음")
            cursor = body["next_cursor"]
            if cursor is None:
                return collected

    def student(self, student_id: str) -> dict[str, Any]:
        res = self._api.get(f"/students/{student_id}")
        res.raise_for_status()
        result: dict[str, Any] = res.json()
        return result

    def download(self, url: str, stem: Path) -> Path | None:
        """확장자는 Content-Type으로 정한다. 실패하면 None."""
        try:
            res = self._files.get(url)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            print(f"  ! 이미지 다운로드 실패 {stem.name}: {exc}", file=sys.stderr)
            return None
        ext = _EXT.get(res.headers.get("content-type", "").split(";")[0].strip(), ".jpg")
        dest = stem.with_suffix(ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(res.content)
        return dest

    def close(self) -> None:
        self._api.close()
        self._files.close()


def _existing(stem: Path) -> Path | None:
    """확장자와 무관하게 이미 받은 파일."""
    return next(iter(sorted(stem.parent.glob(stem.name + ".*"))), None)


def _fetch_image(
    client: ExportClient, url: str | None, stem: Path, *, reuse: bool
) -> tuple[str | None, bool]:
    """(student.json에 넣을 파일명, 새로 받았는지). reuse면 이미 받은 파일을 그대로 쓴다."""
    found = _existing(stem)
    if found and reuse:
        return found.name, False
    if not url:
        return None, False
    if found:
        found.unlink()  # 확장자가 바뀔 수 있어 옛 파일을 지운다
    dest = client.download(url, stem)
    return (dest.name, True) if dest else (None, False)


def run(args: argparse.Namespace, *, transport: httpx.BaseTransport | None = None) -> int:
    key = args.key or os.environ.get("EXPORT_API_KEY", "")
    if not key:
        print("내보내기 키가 없다: --key 또는 환경변수 EXPORT_API_KEY", file=sys.stderr)
        return 1
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    client = ExportClient(args.base_url, key, transport=transport)
    try:
        students = (
            [client.student(args.student_id)]
            if args.student_id
            else client.students(args.page_size)
        )

        new_images = failed = 0
        for s in students:
            folder = out / s["id"]
            folder.mkdir(exist_ok=True)
            meta = folder / "student.json"
            prev = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}

            # 서명 URL은 1시간이면 만료되므로 저장하지 않고 로컬 경로로 바꾼다.
            photo_url = s.pop("photo_url", None)
            persona = s.get("persona")
            image_url = persona.pop("image_url", None) if persona else None
            if args.no_images:
                s["photo_file"] = None
                if persona:
                    persona["image_file"] = None
            else:
                s["photo_file"], fresh = _fetch_image(
                    client, photo_url, folder / "photo", reuse=True
                )
                new_images += fresh
                if persona:
                    # 다시 승인되면 이미지가 바뀔 수 있다 — 승인 시각이 같을 때만 재사용.
                    same = (prev.get("persona") or {}).get("approved_at") == persona["approved_at"]
                    persona["image_file"], fresh = _fetch_image(
                        client, image_url, folder / "persona", reuse=same
                    )
                    new_images += fresh
                failed += bool(photo_url and not s["photo_file"])
                failed += bool(image_url and not (persona and persona["image_file"]))
            meta.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")

        print(
            f"\n학생 {len(students)}명 · 새로 받은 이미지 {new_images}장"
            f"{f' · 실패 {failed}장' if failed else ''} → {out}/<학생 id>/"
        )
        # 실패한 이미지는 다음 실행 때 다시 받는다(파일이 없으니 건너뛰지 않는다).
        return 1 if failed else 0
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = {401: " (내보내기 키 확인)", 404: " (없는 학생 id)"}.get(status, "")
        print(f"요청 실패 {status}{hint}: {exc.response.text[:200]}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="내보내기 API로 학생 데이터·이미지 내려받기")
    parser.add_argument("--base-url", default="https://api.cnu-likelion.kr")
    parser.add_argument("--key", default=None, help="생략 시 환경변수 EXPORT_API_KEY")
    parser.add_argument("--out", default="./export")
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--student-id", default=None, help="학생 1명만 (UUID)")
    parser.add_argument("--no-images", action="store_true", help="이미지 없이 데이터만")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
