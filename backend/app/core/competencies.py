"""NCS 직업기초능력 10개 역량 — 키와 한글 라벨의 단일 출처.

부스 하나에 역량 여럿이 붙고(직업체험 3개, 역량체험 1개), 학생이 그 부스를 방문하면
연결된 역량이 1점씩 오른다. 이 순서가 학생 성향 탭 레이더 차트의 축 순서다.

역량은 10개로 고정이고 이름도 바뀌지 않아 테이블을 두지 않는다. DB 쪽은
ops.booth_competencies의 체크 제약이 같은 목록을 강제한다 — 값을 고칠 때 둘 다 고쳐야 한다.
"""

from __future__ import annotations

COMPETENCY_LABELS: dict[str, str] = {
    "communication": "의사소통",
    "creativity": "창의성",
    "analysis": "분석력",
    "challenge": "도전정신",
    "empathy": "공감",
    "collaboration": "협업",
    "thinking": "사고력",
    "judgment": "판단력",
    "self_understanding": "자기이해",
    "planning": "계획성",
}

# dict는 삽입 순서를 유지한다 — 이 순서가 차트 축 순서다.
COMPETENCY_KEYS: tuple[str, ...] = tuple(COMPETENCY_LABELS)
