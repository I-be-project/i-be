"""조회 전용 개인 페이지 코드. 로그인 JWT와 호환되지 않는 별도 서명 형식."""

import base64
import hashlib
import hmac
import re
from uuid import UUID

from app.config import Settings
from app.core.errors import NotFoundError


def profile_share_code(student_id: UUID, settings: Settings) -> str:
    subject = student_id.hex
    digest = hmac.new(
        settings.jwt_card_share_secret.encode(),
        f"profile-share-v1:{subject}".encode(),
        hashlib.sha256,
    ).digest()
    signature = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return f"{subject}.{signature}"


def read_profile_share_code(code: str, settings: Settings) -> UUID:
    if not re.fullmatch(r"[0-9a-f]{32}\.[A-Za-z0-9_-]{43}", code):
        raise NotFoundError("공유 페이지를 찾을 수 없습니다.")
    student_id = UUID(hex=code[:32])
    if not hmac.compare_digest(code, profile_share_code(student_id, settings)):
        raise NotFoundError("공유 페이지를 찾을 수 없습니다.")
    return student_id
