"""Q7-B / Q8 / Q9 / Q10 프롬프트 빌더.

각 함수는 [{"role": "system", "content": ...}, {"role": "user", "content": ...}]
형태의 메시지 리스트를 반환한다. 시스템 프롬프트와 유저 메시지 내용은
프론트엔드 TypeScript 원본을 그대로 이식했다.
"""

from __future__ import annotations

import json
from typing import Any

from app.schemas.questions import GenerateInput

# ──────────────────────────────────────────────────────────────
# Q7-B
# ──────────────────────────────────────────────────────────────

_Q7B_SYSTEM = """너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q7-B 세부분야 선택 문항을 생성한다. 학생은 나비섬 탐험을 마친 뒤
고른 탐험 구역 안에서 더 깊이 들어가볼 "세부 탐험길"을 고른다.

중요한 표현 원칙:
1. 학생용 선택지는 직업명/산업명/전공명처럼 보이면 안 된다.
2. "시제품","사업화","품질관리","데이터분석","마케팅","컨설팅","프로토타입",
   "컴플라이언스" 같은 전문 용어를 student_title/description에 직접 쓰지 않는다.
3. 전문 용어는 backend_subfield 또는 career_pool에만 넣는다.
4. 학생용 선택지는 "~하는 길","~을 살피는 길","~을 보여주는 길","~을 연결하는 길"
   형태로 탐험 상황에 어울리게 쓴다. 너무 유치하거나 판타지스럽지 않게.
5. Q7-A 1순위 분야를 더 많이 반영하되 2순위도 섞는다.
6. 학생용에는 RIASEC/Pair Code/점수/직업군을 노출하지 않는다.

추가 지침(중요):
- Q7-A 선택의 backend_field/backend_subfields/career_pool 데이터는 주어지지 않는다.
  학생이 고른 Q7-A 문구와 Pair Code로부터 적절한 backend_field와 career_pool을
  스스로 추론한 뒤, 그 분야 기반으로 선택지를 생성하라.

생성 조건:
- 선택지는 총 10개. 학생은 10개 중 1순위와 2순위를 고른다.
- 각 선택지는 학생용 표현과 백엔드 데이터를 분리해 출력한다.
- 10개 선택지의 길이와 매력도를 비슷하게, 같은 의미 반복 금지.

반드시 아래 JSON 스키마로만 출력한다(설명 텍스트 금지):
{"q7b":{"title":"선택한 탐험 구역 안에서 더 깊이 들어가보고 싶은 길은?",
"intro":"방금 고른 구역 안에는 더 자세히 들어가볼 수 있는 길들이 열려 있습니다. 가장 끌리는 길을 1순위와 2순위로 골라주세요.",
"selection_rule":"10개 중 1순위와 2순위 선택",
"options":[{"subfield_id":"SUB_01","student_title":"","student_description":"",
"backend_subfield":"","backend_keywords":[],"career_pool":[],"persona_material_keywords":[]}]}}"""


def build_q7b_messages(data: GenerateInput) -> list[dict[str, Any]]:
    user = (
        f"RIASEC 전체 점수: {json.dumps(data.riasec_scores, ensure_ascii=False)}\n"
        f"Pair Code: {data.pair_code}\n"
        f"Q7-A 1순위 선택(학생 문구): {data.q7a_first}\n"
        f"Q7-A 2순위 선택(학생 문구): {data.q7a_second}\n"
        "\n위 입력으로 Q7-B 10개 선택지를 생성해 JSON으로만 출력하라."
    )
    return [
        {"role": "system", "content": _Q7B_SYSTEM},
        {"role": "user", "content": user},
    ]


# ──────────────────────────────────────────────────────────────
# Q8
# ──────────────────────────────────────────────────────────────

_Q8_SYSTEM = """너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q8 태도 질문을 생성한다. 학생이 선택한 탐험길을 어떤 방식·태도·마음가짐으로
이어가고 싶은지 확인한다. 이 응답은 최종 페르소나 이름의 수식어/동사/분위기 재료다.

학생용 표현 원칙:
1. 탐험 이후 이어지는 장면처럼 쓴다.
2. "태도","직업","업무","역량","산업","전문가" 표현은 피한다.
3. "탐험길","단서","흐름","신호","사람","공간","장면","변화","이야기" 같은 표현 활용.
4. 단어칩(text)은 "~하는","~을 살피는","~을 이어가는","~을 바꾸는","~을 보여주는",
   "~을 지켜보는"처럼 페르소나 이름에 쓸 수 있는 형태로.
5. 전문 용어 금지(예: "데이터를 분석하는"→"숨은 흐름을 읽는").
6. 짧고 명확하게. RIASEC/Pair Code/점수/직업군 비노출.
7. backend(why_generated_backend)에는 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q8":{"title":"내가 고른 탐험길을 어떤 방식으로 이어가고 싶을까?",
"intro":"지금까지의 선택을 바탕으로, 당신이 이 탐험길을 이어가는 방식에 어울릴 만한 표현들이 열렸습니다.",
"answer_type":"word_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 나답다고 느껴지는 표현을 골라주세요.",
"word_chips":[{"chip_id":"ATT_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 원하는 표현을 직접 써도 좋아요."}}"""


def build_q8_messages(data: GenerateInput) -> list[dict[str, Any]]:
    user = (
        f"RIASEC 전체 점수: {json.dumps(data.riasec_scores, ensure_ascii=False)}\n"
        f"Pair Code: {data.pair_code}\n"
        f"Q1~Q6 선택 로그: {json.dumps(data.q1to6, ensure_ascii=False)}\n"
        f"Q7-A 1순위: {data.q7a_first}\n"
        f"Q7-A 2순위: {data.q7a_second}\n"
        f"Q7-B 1순위: {json.dumps(data.q7b_first, ensure_ascii=False)}\n"
        f"Q7-B 2순위: {json.dumps(data.q7b_second, ensure_ascii=False)}\n"
        "\n위 입력으로 Q8 단어칩을 생성해 JSON으로만 출력하라."
    )
    return [
        {"role": "system", "content": _Q8_SYSTEM},
        {"role": "user", "content": user},
    ]


# ──────────────────────────────────────────────────────────────
# Q9
# ──────────────────────────────────────────────────────────────

_Q9_SYSTEM = """너는 중·고등학생 대상 진로 페르소나 질문지를 설계하는 전문가다.
질문지 콘셉트: 친구들과 떠나는 나비섬 탐험 미션.

과업: Q9 관심 대상/주제 질문을 생성한다. 학생이 선택한 탐험길에서 무엇을 더
살펴보고 싶은지, 그 길이 누구에게 닿으면 좋겠는지 확인한다. 이 응답은 최종
페르소나 이름의 "대상" 표현 재료다. 관심 주제는 고정 목록이 아니라 Q1~Q8을
바탕으로 생성한다.

학생용 표현 원칙:
1. 탐험 이후 장면처럼, 쉽게 묻는다("더 살펴보고 싶은 것","마음이 가는 장면",
   "도움이 닿았으면 하는 대상","바꾸고 싶은 불편함").
2. "문제의식","가치관","사회적 의제","직업 분야" 같은 딱딱한 표현 금지.
3. 주제칩(text)은 최종 이름의 대상이 될 만큼 구체적으로.
4. 전문 용어 금지(예: "환경보호"→"숲과 동물의 안전","접근성"→"누구나 이해하기 쉬운 안내").
5. 짧고 구체적으로. RIASEC/Pair Code/점수/직업군 비노출.
6. backend(why_generated_backend)에 생성 근거를 남긴다.

반드시 아래 JSON 스키마로만 출력한다(칩 6~8개 권장):
{"q9":{"title":"이 탐험길에서 가장 더 살펴보고 싶은 것은 무엇일까?",
"intro":"당신이 고른 탐험길 안에서 특히 마음이 가는 대상이나 장면을 골라주세요.",
"answer_type":"topic_chips_plus_free_text","selection_rule":"후보 중 1~2개를 고르거나 직접 입력",
"student_prompt":"가장 마음이 가는 표현을 골라주세요.",
"topic_chips":[{"chip_id":"TOPIC_01","text":"","why_generated_backend":"","persona_usage_hint":""}],
"free_text_placeholder":"내가 더 관심 있는 대상을 직접 써도 좋아요."}}"""


def build_q9_messages(data: GenerateInput) -> list[dict[str, Any]]:
    user = (
        f"RIASEC 전체 점수: {json.dumps(data.riasec_scores, ensure_ascii=False)}\n"
        f"Pair Code: {data.pair_code}\n"
        f"Q1~Q6 선택 로그: {json.dumps(data.q1to6, ensure_ascii=False)}\n"
        f"Q7-A 1순위: {data.q7a_first}\n"
        f"Q7-A 2순위: {data.q7a_second}\n"
        f"Q7-B 1순위: {json.dumps(data.q7b_first, ensure_ascii=False)}\n"
        f"Q7-B 2순위: {json.dumps(data.q7b_second, ensure_ascii=False)}\n"
        f"Q8 선택: {json.dumps(data.q8, ensure_ascii=False)}\n"
        "\n위 입력으로 Q9 주제칩을 생성해 JSON으로만 출력하라."
    )
    return [
        {"role": "system", "content": _Q9_SYSTEM},
        {"role": "user", "content": user},
    ]


# ──────────────────────────────────────────────────────────────
# Q10
# ──────────────────────────────────────────────────────────────

_Q10_SYSTEM = """너는 중·고등학생 대상 진로 페르소나 카드의 이름을 만드는 작명가이자
진로 콘텐츠 기획자다.

과업: 학생에게 제시할 최종 진로 페르소나 이름 후보 3개를 생성한다.
Q1~Q9는 나비섬 탐험 형식이었지만 Q10에서는 현실 진로 페르소나 이름으로 전환한다.
이름은 실제 진로·직업·역할과 연결되는 현실적 이름이어야 한다.

생성 조건:
1. 이름에 "나비섬","탐험","탐험가","미션","구역","탐험길" 같은 세계관 표현 금지.
2. Pair Code/RIASEC 유형명/점수를 이름에 직접 노출 금지.
3. 직업군은 참고하되 특정 직업을 강하게 단정하지 않는다.
4. "현실에서 있을 법한 역할형 페르소나"처럼. 너무 추상적/유치/과장 금지.
5. Q8/Q9 직접 입력이 있으면 우선 반영.
6. 후보 3개는 서로 충분히 다르고 강조점이 다르다.
   1안: 관심 대상 중심 / 2안: 태도·방식 중심 / 3안: 분야·역할 중심.
7. 각 후보에 중·고등학생이 이해할 한 줄 설명.
8. 이름 구조 예: "[대상]을 [태도/방식]하는 [역할명]" 등.
좋은 예: 숲을 지키는 드론전문가, 감정을 번역하는 콘텐츠 기획자,
도시의 빈틈을 설계하는 공간기획자.
피할 예: 나비섬 탐험가, 미션 해결 전문가, RA형 제작 창작자, 미래를 여는 융합형 인재.

반드시 아래 JSON 스키마로만 출력한다:
{"q10":{"title":"당신의 나Be 페르소나 이름을 골라주세요",
"intro":"지금까지의 선택을 바탕으로 3개의 진로 페르소나 이름이 만들어졌습니다. 가장 마음에 드는 이름을 하나 선택해주세요.",
"selection_rule":"3개 중 1개 선택",
"name_cards":[{"name_id":"NAME_01","persona_name":"","short_description":"",
"emphasis":"관심 대상 중심","materials_used_backend":{"pair_code":"","field":"",
"subfield":"","attitude":"","topic":"","career_reference":""}},
{"name_id":"NAME_02","persona_name":"","short_description":"","emphasis":"태도/방식 중심","materials_used_backend":{}},
{"name_id":"NAME_03","persona_name":"","short_description":"","emphasis":"분야/역할 중심","materials_used_backend":{}}]}}"""


def build_q10_messages(data: GenerateInput) -> list[dict[str, Any]]:
    user = (
        f"RIASEC 전체 점수: {json.dumps(data.riasec_scores, ensure_ascii=False)}\n"
        f"Pair Code: {data.pair_code}\n"
        f"Q1~Q6 선택 요약: {json.dumps(data.q1to6, ensure_ascii=False)}\n"
        f"Q7-A 1순위: {data.q7a_first}\n"
        f"Q7-A 2순위: {data.q7a_second}\n"
        f"Q7-B 1순위: {json.dumps(data.q7b_first, ensure_ascii=False)}\n"
        f"Q7-B 2순위: {json.dumps(data.q7b_second, ensure_ascii=False)}\n"
        f"Q7 career_pool 참고: {json.dumps(data.career_pool if data.career_pool is not None else [], ensure_ascii=False)}\n"
        f"Q8 선택/직접입력: {json.dumps(data.q8, ensure_ascii=False)}\n"
        f"Q9 선택/직접입력: {json.dumps(data.q9, ensure_ascii=False)}\n"
        "\n위 입력으로 페르소나 이름 후보 3개를 생성해 JSON으로만 출력하라."
    )
    return [
        {"role": "system", "content": _Q10_SYSTEM},
        {"role": "user", "content": user},
    ]
