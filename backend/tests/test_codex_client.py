"""CodexClient — 서브프로세스 실행·실패 처리.

실제 codex 대신 인자를 흉내 내는 가짜 실행 파일을 세워 검증한다.
실패 경로(미설치·비정상 종료·타임아웃)가 조용히 통과하면 dev 화면이
빈 결과를 성공으로 표시하므로, 실패가 예외로 드러나는지가 핵심이다.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
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


@pytest.fixture(autouse=True)
def _launch_python_test_binary(monkeypatch):
    """실제 프로세스/파이프는 유지하고 테스트 스크립트의 인터프리터만 명시한다."""
    original = subprocess.Popen

    def launch(args, *positional, **kwargs):
        if isinstance(args, list) and str(args[0]).endswith("fake-codex.py"):
            args = [sys.executable, *args]
        return original(args, *positional, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", launch)


def _fake_binary(tmp_path: Path, body: str) -> str:
    """Unix 셸에 의존하지 않는 가짜 CLI. Windows에서도 stdin/종료/타임아웃을 검증한다."""
    path = tmp_path / "fake-codex.py"
    path.write_text("import sys, time\nfrom pathlib import Path\n" + body + "\n", encoding="utf-8")
    return str(path)


_WRITE_JSON = """
Path(sys.argv[sys.argv.index("-o") + 1]).write_text('{"persona_name":"테스트"}', encoding="utf-8")
"""


async def test_generate_json_reads_output_file(tmp_path: Path) -> None:
    client = CodexClient(binary=_fake_binary(tmp_path, _WRITE_JSON), timeout_seconds=10)

    assert await client.generate_json("프롬프트", {"type": "object"}) == {"persona_name": "테스트"}


async def test_generate_json_fails_when_no_output_written(tmp_path: Path) -> None:
    """codex가 0으로 끝났는데 응답 파일이 없으면 성공으로 취급하면 안 된다."""
    client = CodexClient(binary=_fake_binary(tmp_path, "sys.exit(0)"), timeout_seconds=10)

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_generate_json_fails_on_non_json_output(tmp_path: Path) -> None:
    body = 'Path(sys.argv[sys.argv.index("-o") + 1]).write_text("JSON 아님", encoding="utf-8")'
    client = CodexClient(binary=_fake_binary(tmp_path, body), timeout_seconds=10)

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_missing_binary_is_reported(tmp_path: Path) -> None:
    client = CodexClient(binary=str(tmp_path / "없는-실행파일"), timeout_seconds=10)

    with pytest.raises(ExternalServiceError, match="찾지 못했습니다"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_non_zero_exit_is_reported(tmp_path: Path) -> None:
    client = CodexClient(
        binary=_fake_binary(
            tmp_path, 'sys.stderr.buffer.write("터졌다".encode("utf-8")); sys.exit(3)'
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError, match="실패했습니다"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_timeout_kills_the_process(tmp_path: Path) -> None:
    """이미지 생성이 매달리면 요청이 영원히 붙잡히지 않고 예외로 끝나야 한다."""
    client = CodexClient(binary=_fake_binary(tmp_path, "time.sleep(30)"), timeout_seconds=0.3)

    with pytest.raises(ExternalServiceError, match="시간 내에"):
        await client.generate_json("프롬프트", {"type": "object"})


async def test_generate_image_retries_once_then_fails(tmp_path: Path) -> None:
    """codex는 exit 0으로 끝나고도 이미지를 안 만들 때가 있다(실측).

    빈 bytes를 성공으로 돌려주면 안 되고, 포기 전에 한 번은 더 시도해야 한다.
    """
    count = tmp_path / "count.txt"
    client = CodexClient(
        binary=_fake_binary(
            tmp_path, f'with Path({str(count)!r}).open("a", encoding="utf-8") as f: f.write("x\\n")'
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError, match="만들지 않았습니다"):
        await client.generate_image("프롬프트", photo=_PNG_BYTES)

    assert len(count.read_text(encoding="utf-8").split()) == 2  # 최초 1회 + 재시도 1회


async def test_input_photo_keeps_its_real_extension(tmp_path: Path) -> None:
    """학생 사진은 대부분 JPEG다 — .png로 저장하면 codex의 MIME 판단이 어긋난다."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(
            tmp_path,
            f'Path({str(args_log)!r}).write_text(" ".join(sys.argv[1:]), encoding="utf-8")',
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("프롬프트", photo=_JPEG_BYTES)

    assert "input.jpg" in args_log.read_text(encoding="utf-8")


async def test_generate_image_passes_photo_as_attachment(tmp_path: Path) -> None:
    """사진을 주면 -i로 첨부돼야 한다(입력 얼굴 없이 생성되면 기능이 무의미)."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(
            tmp_path,
            f'Path({str(args_log)!r}).write_text(" ".join(sys.argv[1:]), encoding="utf-8")',
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("프롬프트", photo=_PNG_BYTES)

    recorded = args_log.read_text(encoding="utf-8")
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
        binary=_fake_binary(
            tmp_path,
            f'Path({str(args_log)!r}).write_text(" ".join(sys.argv[1:]), encoding="utf-8"); '
            f"Path({str(stdin_log)!r}).write_bytes(sys.stdin.buffer.read())",
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_image("10년 뒤 모습", photo=_PNG_BYTES)

    assert "10년 뒤 모습" in stdin_log.read_text(encoding="utf-8")
    assert "10년 뒤 모습" not in args_log.read_text(encoding="utf-8")


async def test_generate_json_uses_read_only_sandbox(tmp_path: Path) -> None:
    """텍스트 생성은 파일을 쓸 이유가 없다 — 권한을 넓히지 않았는지 확인."""
    args_log = tmp_path / "args.txt"
    client = CodexClient(
        binary=_fake_binary(
            tmp_path,
            f'Path({str(args_log)!r}).write_text(" ".join(sys.argv[1:]), encoding="utf-8")',
        ),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError):
        await client.generate_json("프롬프트", {"type": "object"})

    assert "read-only" in args_log.read_text(encoding="utf-8")


def test_env_default_binary_is_plain_codex() -> None:
    """PATH의 codex를 쓰는 게 기본 — 전역 경로 하드코딩이 없는지 확인."""
    from app.config import Settings

    assert Settings().codex_bin == "codex"
    assert os.sep not in Settings().codex_bin


async def test_image_refusal_reason_is_surfaced(tmp_path: Path) -> None:
    """codex가 이미지 대신 거절 사유만 답하면 그 사유가 오류 메시지에 담겨야 한다."""
    client = CodexClient(
        binary=_fake_binary(tmp_path, "print('얼굴이 손에 가려져 생성할 수 없습니다.')"),
        timeout_seconds=10,
    )

    with pytest.raises(ExternalServiceError, match="얼굴이 손에 가려져"):
        await client.generate_image("프롬프트", photo=_JPEG_BYTES)


async def test_cancel_kills_the_process(tmp_path: Path) -> None:
    """일괄 생성을 중단하면 codex 프로세스도 함께 죽어야 한다(고아로 남아 사용량을 쓰지 않게)."""
    pid_file = tmp_path / "pid"
    client = CodexClient(
        binary=_fake_binary(
            tmp_path,
            f"import os\nPath({str(pid_file)!r}).write_text(str(os.getpid()))\ntime.sleep(30)",
        ),
        timeout_seconds=60,
    )
    task = asyncio.create_task(client.generate_json("프롬프트", {"type": "object"}))
    for _ in range(100):  # 가짜 codex가 뜰 때까지
        if pid_file.exists() and pid_file.read_text().strip():
            break
        await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    pid = int(pid_file.read_text())
    for _ in range(40):  # SIGKILL 반영까지 잠깐 기다린다
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        await asyncio.sleep(0.05)
    pytest.fail("codex 프로세스가 살아 있다")
