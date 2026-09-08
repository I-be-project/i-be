"""Codex CLI 어댑터 — dev 전용.

로컬에 설치된 `codex exec`를 서브프로세스로 돌려 텍스트(JSON)와 이미지를 얻는다.
OpenRouter(AIClient)와 완전히 독립적이며, API 키·크레딧 없이 동작한다.

- 텍스트: `--output-schema`로 JSON 형태를 강제하고 `-o`로 마지막 메시지를 파일에 받는다.
- 이미지: codex의 내장 image_generation이 만든 파일을 지정 경로로 복사하도록 지시하고
  그 파일을 읽는다. 이벤트 스트림(JSONL) 파싱보다 형식 변화에 둔감하다.

배포 서버엔 codex 바이너리가 없다 — 이 어댑터를 쓰는 라우터는 APP_ENV 가드로 막는다.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import signal
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from app.core.errors import ExternalServiceError
from app.core.images import inspect_image
from app.core.logging import get_logger

logger = get_logger(__name__)

# codex가 생성 이미지를 저장할 파일명. 프롬프트와 읽기 경로가 이 한 값을 공유한다.
_IMAGE_FILENAME = "out.png"


class CodexClient:
    def __init__(self, *, binary: str, timeout_seconds: float) -> None:
        self._binary = binary
        self._timeout = timeout_seconds

    async def generate_json(
        self, prompt: str, schema: dict[str, Any], *, model: str | None = None
    ) -> dict[str, Any]:
        """프롬프트 → 스키마를 만족하는 JSON dict.

        --output-schema가 형태를 강제하므로 파싱 실패는 사실상 codex 자체 실패다.
        """
        with TemporaryDirectory() as tmp:
            work = Path(tmp)
            schema_path = work / "schema.json"
            schema_path.write_text(json.dumps(schema, ensure_ascii=False), encoding="utf-8")
            out_path = work / "last.txt"

            await self._run(
                [
                    "exec",
                    "--sandbox",
                    "read-only",
                    "--skip-git-repo-check",
                    "-C",
                    str(work),
                    "--output-schema",
                    str(schema_path),
                    "-o",
                    str(out_path),
                    *(("-m", model) if model else ()),
                ],
                prompt,
            )

            if not out_path.exists():
                raise ExternalServiceError("codex가 응답 파일을 남기지 않았습니다.")
            raw = out_path.read_text(encoding="utf-8").strip()

        try:
            parsed = json.loads(raw)
        except ValueError as exc:
            raise ExternalServiceError(
                "codex 응답을 JSON으로 읽지 못했습니다.", details={"body": raw[:500]}
            ) from exc
        if not isinstance(parsed, dict):
            raise ExternalServiceError(
                "codex 응답이 JSON 객체가 아닙니다.", details={"body": raw[:500]}
            )
        return parsed

    async def generate_image(
        self, prompt: str, *, photo: bytes | None = None, model: str | None = None
    ) -> bytes:
        """프롬프트(+선택 입력 사진) → PNG bytes.

        photo를 주면 `-i`로 첨부해 그 얼굴을 기준으로 생성한다.

        codex는 결정적 도구가 아니라 에이전트다 — 정상 종료(exit 0)하고도 이미지를
        만들지 않는 경우가 실제로 관측된다. 파일 부재로 확실히 판별되므로 1회 재시도한다.
        """
        for attempt in range(2):
            image = await self._image_attempt(prompt, photo, model)
            if image is not None:
                return image
            logger.warning("codex.image.no_output", attempt=attempt + 1)
        raise ExternalServiceError(
            "codex가 이미지를 지정 경로에 저장하지 않았습니다 (재시도 후에도).",
            details={"attempts": 2},
        )

    async def _image_attempt(
        self, prompt: str, photo: bytes | None, model: str | None
    ) -> bytes | None:
        """이미지 생성 1회 시도. codex가 파일을 남기지 않았으면 None."""
        with TemporaryDirectory() as tmp:
            work = Path(tmp)
            out_path = work / _IMAGE_FILENAME

            attach: tuple[str, ...] = ()
            if photo is not None:
                # 확장자를 실제 포맷에 맞춘다. JPEG를 .png로 저장하면 codex가 확장자로
                # MIME을 판단할 때 어긋난다(학생 사진은 대부분 JPEG다).
                suffix = inspect_image(photo).image_format.lower().replace("jpeg", "jpg")
                photo_path = work / f"input.{suffix}"
                photo_path.write_bytes(photo)
                attach = ("-i", str(photo_path))

            # 쓰기 권한이 필요하다(생성 이미지를 out.png로 복사) → workspace-write.
            await self._run(
                [
                    "exec",
                    "--sandbox",
                    "workspace-write",
                    "--skip-git-repo-check",
                    "-C",
                    str(work),
                    *attach,
                    *(("-m", model) if model else ()),
                ],
                f"{prompt}\n\n"
                f"생성한 이미지를 반드시 {out_path} 경로에 PNG로 저장해라. "
                f"저장 후 파일 경로만 한 줄로 답해라.",
            )

            return out_path.read_bytes() if out_path.exists() else None

    async def _run(self, args: list[str], prompt: str) -> str:
        """codex 서브프로세스 1회 실행. stdout 반환, 실패는 ExternalServiceError.

        프롬프트는 인자가 아니라 stdin으로 넘긴다. `-i/--image`가 가변 인자라
        뒤따르는 positional 프롬프트를 이미지 파일로 삼켜버리고, `-`로 시작하는
        프롬프트가 플래그로 해석되는 문제도 함께 피한다.
        """
        try:
            # start_new_session으로 자체 프로세스 그룹을 준다. codex는 셸 명령을 자식으로
            # 띄우는 에이전트라, 부모만 kill하면 자식이 stdout 파이프를 붙든 채 살아남아
            # proc.wait()가 그 자식이 끝날 때까지 블록된다 — 타임아웃이 무력해진다.
            proc = await asyncio.create_subprocess_exec(
                self._binary,
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
        except (OSError, FileNotFoundError) as exc:
            raise ExternalServiceError(
                f"codex 실행 파일을 찾지 못했습니다: {self._binary}", details={"reason": str(exc)}
            ) from exc

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(prompt.encode()), timeout=self._timeout
            )
        except TimeoutError as exc:
            self._kill_group(proc)
            raise ExternalServiceError(
                "codex 실행이 시간 내에 끝나지 않았습니다.",
                details={"timeout_seconds": self._timeout},
            ) from exc

        if proc.returncode != 0:
            raise ExternalServiceError(
                "codex 실행이 실패했습니다.",
                details={"exit_code": proc.returncode, "stderr": stderr.decode()[-500:]},
            )
        logger.info("codex.done", exit_code=proc.returncode)
        return stdout.decode()

    @staticmethod
    def _kill_group(proc: asyncio.subprocess.Process) -> None:
        """codex와 그 자식들을 통째로 종료한다.

        수거(reap)는 asyncio 자식 워처에 맡긴다 — 여기서 await하면 파이프를 물고 있는
        자식 때문에 다시 블록될 수 있어, 타임아웃을 건 의미가 사라진다.
        """
        with contextlib.suppress(ProcessLookupError, PermissionError, OSError):
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
