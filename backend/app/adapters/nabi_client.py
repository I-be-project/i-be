"""나비(페인트팜) 결과 조회 API 어댑터 — 학생의 마지막 나비 그림 한 장.

명세: GET {base}/{student_id}, Bearer 토큰. status = done|processing|pending|failed.
image_url은 인증 없는 30일 서명 주소라 저장하지 않고 그대로 프론트에 넘긴다.
3단계 전 학생을 조회하면 나비 서버가 우리 내보내기 API를 한 번 되부르므로
같은 학생의 연속 조회는 짧게 캐시한다.
"""

from __future__ import annotations

import time
from uuid import UUID

import httpx

from app.config import Settings
from app.core.logging import get_logger
from app.schemas.students import NabiResult

logger = get_logger(__name__)

# 토큰 미설정·타임아웃·5xx 등 — 카드 뒷면은 기본 이미지로 둔다.
UNAVAILABLE = NabiResult(status="unavailable")


class NabiClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        timeout: float = 10.0,
        cache_ttl: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,  # 테스트에서 가짜 전송 주입용
    ) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._ttl = cache_ttl
        self._http = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {token}"}, timeout=timeout, transport=transport
        )
        # ponytail: 프로세스 메모리 캐시(워커 간 공유 X, 만료 항목은 덮어쓸 때만 갱신).
        # 학생 수천 명 규모라 그대로 둔다. 워커가 늘어 조회가 몰리면 Redis 등으로 옮긴다.
        self._cache: dict[UUID, tuple[float, NabiResult]] = {}

    @classmethod
    def from_settings(cls, settings: Settings) -> NabiClient:
        return cls(settings.nabi_api_url, settings.nabi_api_token)

    async def get_result(self, student_id: UUID) -> NabiResult:
        if not self._token:
            return UNAVAILABLE
        hit = self._cache.get(student_id)
        if hit is not None and hit[0] > time.monotonic():
            return hit[1]
        result = await self._fetch(student_id)
        self._cache[student_id] = (time.monotonic() + self._ttl, result)
        return result

    async def _fetch(self, student_id: UUID) -> NabiResult:
        try:
            res = await self._http.get(f"{self._base}/{student_id}")
            res.raise_for_status()
            return NabiResult.model_validate(res.json())
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("nabi.fetch_failed", student_id=str(student_id), error=repr(exc))
            return UNAVAILABLE

    async def aclose(self) -> None:
        await self._http.aclose()
