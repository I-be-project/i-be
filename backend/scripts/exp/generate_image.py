"""이미지 생성 실험 CLI.

Usage:
  uv run python -m scripts.exp.generate_image "프롬프트" [--out out.png] [--size 1024x1024] [--purpose portrait|world]

예시:
  uv run python -m scripts.exp.generate_image \\
      "A futuristic young Korean drone pilot in a misty forest, anime portrait, soft light"

환경변수:
  AI_IMAGE_API_URL    (default: Mindlogic)
  AI_IMAGE_API_KEY    (필수)
  AI_IMAGE_MODEL      (default: gpt-image-1)
  AI_IMAGE_SIZE       (default: 1024x1024)
"""

from __future__ import annotations

import argparse
import asyncio
import time
from pathlib import Path

from app.adapters.ai_client import AIClient, AIPurpose
from app.config import get_settings

_PURPOSE_MAP = {
    "portrait": AIPurpose.PORTRAIT_IMAGE,
    "world": AIPurpose.WORLD_IMAGE,
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="이미지 생성 실험")
    parser.add_argument("prompt", help="이미지 생성 프롬프트")
    parser.add_argument(
        "--out",
        default=None,
        help="저장 경로 (기본: out/img-<timestamp>.png)",
    )
    parser.add_argument("--size", default=None, help="이미지 크기 (예: 1024x1024)")
    parser.add_argument(
        "--purpose",
        choices=list(_PURPOSE_MAP.keys()),
        default="portrait",
        help="용도 라벨 (현재 모델은 동일)",
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    client = AIClient.from_settings(settings)

    purpose = _PURPOSE_MAP[args.purpose]
    out_path = Path(args.out) if args.out else Path("out") / f"img-{int(time.time())}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"prompt: {args.prompt!r}")
    print(f"model:  {settings.ai_image_model}")
    print(f"size:   {args.size or settings.ai_image_size}")
    print(f"url:    {settings.ai_image_api_url}")
    print("→ 호출 중...")
    started = time.perf_counter()

    try:
        image_bytes = await client.generate_image(purpose, args.prompt, size=args.size)
    finally:
        await client.aclose()

    elapsed = time.perf_counter() - started
    out_path.write_bytes(image_bytes)
    print(f"✅ saved: {out_path}  ({len(image_bytes):,} bytes, {elapsed:.1f}s)")
    return 0


def main() -> None:
    args = _parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
