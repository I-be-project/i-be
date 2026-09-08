"""CodexClient — 서브프로세스 실행·실패 처리.

실제 codex 대신 인자를 흉내 내는 가짜 실행 파일을 세워 검증한다.
실패 경로(미설치·비정상 종료·타임아웃)가 조용히 통과하면 dev 화면이
빈 결과를 성공으로 표시하므로, 실패가 예외로 드러나는지가 핵심이다.
"""

from __future__ import annotations

import os
import stat
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.adapters.codex_client import CodexClient
from app.core.errors import ExternalServiceError


def _image_bytes(fmt: str) -> bytes:
    """PIL로 만든 최소한의 진짜 이미지 — 확장자 판별에 실제 포맷이 필요하다."""
    buf = BytesIO()
    # inspect_image가 100바이트 미만을 거른다 — 단색 소형 이미지는 그보다 작게 압축된다.
    im = Image.new("RGB", (64, 64))
    im.putdata([(x * 4 % 256, y * 4 % 256, (x + y) % 256) for y in range(64) for x in range(64)])
    im.save(buf, format=fmt)
    return buf.getvalue()


_PNG_BYTES = _image_bytes("PNG")
_JPEG_BYTES = _image_bytes("JPEG")


def _fake_binary(tmp_path: Path, body: str) -> str:
    """주어진 셸 본문을 실행하는 가짜 codex 실행 파일을 만든다."""
    path = tmp_path / "fake-codex"
    path.write_text(f"#!/bin/sh\n{body}\n")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return str(path)


# `-o <파일>` 인자를 찾아 그 경로에 JSON을 쓰는 가짜 codex.
_WRITE_JSON = """
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then shift; printf '%s' '{"persona_name":"테스트"}' > "$1"; fi
  shift
done
"""

# 인자에 섞인 out.png 경로를 찾아 최소 PNG 헤더를 쓰는 가짜 codex.
_WRITE_PNG = """
for arg in "$@"; do
  case "$arg" in
    *out.png*) printf '\\211PNG\\r\\n\\032\\n' > "${arg##* }" ;;
  esac
done
"""


async def test_generate_json_reads_output_file(tmp_path: Path) -> None:
    client = CodexClient(binary=_fake_binary(tmp_path, _WRITE_JSON), timeout_seconds=10)

    assert await client.generate_json("프롬프트", {"type": "object"}) == {"persona_name": "테스트"}


async def test_generate_json_fails_when_no_output_written(tmp_path: Path) -> None:
    """codex가 0으로 끝났는데 응답 파일이 없으면 성공으로 취급하면 안 된다."""
    client = CodexClient(binary=_fake_binary(tmp_path, "exit 0"), timeout_seconds=10)

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_generate_json_fails_on_non_json_output(tmp_path: Path) -> None:
    body = 'while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then shift; printf \'JSON 아님\' > "$1"; fi; shift; done'
    client = CodexClient(binary=_fake_binary(tmp_path, body), timeout_seconds=10)

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_missing_binary_is_reported(tmp_path: Path) -> None:
    client = CodexClient(binary=str(tmp_path / "없는-실행파일"), timeout_seconds=10)

    with pytest.raises(ExternalServiceError, match="찾지 못했습니다"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_non_zero_exit_is_reported(tmp_path: Path) -> None:
    client = CodexClient(
        binary=_fake_binary(tmp_path, "echo '터졌다' >&2; exit 3"), timeout_seconds=10
    )

    with pytest.raises(ExternalServiceError, match="실패했습니다"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_timeout_kills_the_process(tmp_path: Path) -> None:
    """이미지 생성이 매달리면 요청이 영원히 붙잡히지 않고 예외로 끝나야 한다."""
    client = CodexClient(binary=_fake_binary(tmp_path, "sleep 30"), timeout_seconds=0.3)

    with pytest.raises(ExternalServiceError, match="시간 내에"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_generate_image_retries_once_then_fails(tmp_path: Path) -> None:
    """codex는 exit 0으로 끝나고도 이미지를 안 만들 때가 있다(실측).

    빈 bytes를 성공으로 돌려주면 안 되고, 포기 전에 한 번은 더 시도해야 한다.
    """
    count = tmp_path / "count.txt"
    client = CodexClient(
        binary=_fake_binary(tmp_path, f"echo x >> {count}; exit 0"), timeout_seconds=10
    )

    with pytest.raises(ExternalServiceError, match="저장하지 않았습니다"):
        await client.generate_image("프롬프트", photo=_PNG_BYTES)

    assert len(count.read_text().split()) == 2  # 최초 1회 + 재시도 1회


async def test_input_photo_keeps_its_real_extension(tmp_path: Path) -> None:
    """학생 사진은 대부분 JPEG다 — .png로 저장하면 codex의 MIME 판단이 어긋난다."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(tmp_path, f'echo "$@" > {args_log}; exit 0'), timeout_seconds=10
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("프롬프트", photo=_JPEG_BYTES)

    assert "input.jpg" in args_log.read_text()


async def test_generate_image_passes_photo_as_attachment(tmp_path: Path) -> None:
    """사진을 주면 -i로 첨부돼야 한다(입력 얼굴 없이 생성되면 기능이 무의미)."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(tmp_path, f'echo "$@" > {args_log}; exit 0'), timeout_seconds=10
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("프롬프트", photo=_PNG_BYTES)

    recorded = args_log.read_text()
    assert " -i " in recorded
    assert "input.png" in recorded
    assert "workspace-write" in recorded


async def test_prompt_goes_through_stdin_not_argv(tmp_path: Path) -> None:
    """`-i/--image`가 가변 인자라, 프롬프트를 positional로 넘기면 이미지 파일로 삼켜진다.

    실제로 codex가 "No prompt provided via stdin."으로 죽었던 회귀 —
    프롬프트는 stdin으로만 가야 하고 argv에는 남으면 안 된다.
    """
    args_log = tmp_path / "args.txt"
    stdin_log = tmp_path / "stdin.txt"
    client = CodexClient(
        binary=_fake_binary(tmp_path, f'echo "$@" > {args_log}; cat > {stdin_log}; exit 0'),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("10년 뒤 모습", photo=_PNG_BYTES)

    assert "10년 뒤 모습" in stdin_log.read_text()
    assert "10년 뒤 모습" not in args_log.read_text()


async def test_generate_json_uses_read_only_sandbox(tmp_path: Path) -> None:
    """텍스트 생성은 파일을 쓸 이유가 없다 — 권한을 넓히지 않았는지 확인."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(tmp_path, f'echo "$@" > {args_log}; exit 0'), timeout_seconds=10
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})

    assert "read-only" in args_log.read_text()


def test_env_default_binary_is_plain_codex() -> None:
    """PATH의 codex를 쓰는 게 기본 — 전역 경로 하드코딩이 없는지 확인."""
    from app.config import Settings

    assert Settings().codex_bin == "codex"
    assert os.sep not in Settings().codex_bin
