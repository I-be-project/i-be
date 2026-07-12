// 나로섬 탐험 미션 — 선택형 질문지 (Q1~Q6).
// 출처: "나비한마당 Q1-6 소스" (직관형 Q1~Q2, 상황형 Q3~Q6).
// 운영 주의: 학생용 화면에는 유형명/점수를 노출하지 않는다.
// 채점은 선택지 번호가 아니라 고유 ID(option.id) 기준으로 매핑한다.

export type RiasecType = "R" | "I" | "A" | "S" | "E" | "C";

export interface QuestionOption {
  id: string; // 채점용 고유 코드 (선택지 순서를 섞어도 안전)
  label: string;
  primary: RiasecType; // +2점
  secondary?: RiasecType; // +1점 (상황형 문항에만 존재)
}

export interface Question {
  id: number;
  /** 상황 설명(내레이션) — 질문 위에 작은 글씨로 노출 */
  story?: string;
  /** 실제 질문 — 크게 강조해서 노출 */
  text: string;
  type: "choice" | "text";
  /** 스토리 장면 라벨 — 장면 창에 "장면 N · {scene}" 칩으로 노출 */
  scene?: string;
  options?: QuestionOption[];
}

// 응답 안내문 (질문 시작 전 노출용)
export const explorationIntro =
  "친구들과 함께 나로섬 탐험 캠프에 발을 디뎠어. " +
  "낮에는 팀과 코스를 돌고, 해가 지면 ‘별빛 프로그램’으로 캠프 곳곳이 열려. " +
  "정답은 없어. 지금 이 순간, 가장 너다운 선택을 하나씩 골라줘.";

export const mockQuestions: Question[] = [
  {
    id: 1,
    scene: "선착장 도착",
    story:
      "함께한 팀원들이 탄 뱃머리가 선착장에 닿자, 바닷바람이 느껴지며 바람 끝에 흔들리는 깃발 소리가 들려온다. 캠프 광장 멀리에는 안내단 선배가 손을 흔든다. 팀원들도 하나둘 내리기 시작했다.",
    text: "가장 먼저 시작하는 일은?",
    type: "choice",
    options: [
      {
        id: "q1-s",
        label: "친구들이 멀미는 없는지, 다들 괜찮은지 살핀다.",
        primary: "S",
      },
      {
        id: "q1-i",
        label: "지도와 주변 풍경을 비교해 지금 위치를 짐작한다.",
        primary: "I",
      },
      {
        id: "q1-a",
        label: "깃발이나 표식으로 우리 팀만의 출발 표시를 만든다.",
        primary: "A",
      },
      {
        id: "q1-c",
        label: "가방과 장비를 한곳에 모아 빠진 것이 없는지 본다.",
        primary: "C",
      },
      {
        id: "q1-r",
        label: "돗자리나 끈을 꺼내 임시로 머물 자리를 만들어본다.",
        primary: "R",
      },
      {
        id: "q1-e",
        label: "먼저 어디를 둘러볼지 말하고 친구들을 모은다.",
        primary: "E",
      },
    ],
  },
  {
    id: 2,
    scene: "역할 정하기",
    story:
      "광장 한가운데, 각 팀을 상징하는 깃발이 꽂혀 있다. 안내단 선배가 말한다. “앞으로의 탐험 코스는 함께해야 재미있어. 마음에 드는 깃발 아래에서 각자 맡을 역할을 정해볼까?”",
    text: "내가 자연스럽게 맡고 싶은 역할은?",
    type: "choice",
    options: [
      {
        id: "q2-c",
        label: "탐험 시간과 준비물을 확인하는 기록·정리 담당",
        primary: "C",
      },
      {
        id: "q2-a",
        label: "길 표지판과 팀 깃발을 만드는 표지판·깃발 담당",
        primary: "A",
      },
      {
        id: "q2-s",
        label: "친구들의 몸 상태와 분위기를 살피는 친구 살핌 담당",
        primary: "S",
      },
      {
        id: "q2-r",
        label: "짐을 옮기고 필요한 물건을 만드는 도구·만들기 담당",
        primary: "R",
      },
      {
        id: "q2-e",
        label: "다음 행동을 제안하고 팀을 모으는 팀 이끌기 담당",
        primary: "E",
      },
      {
        id: "q2-i",
        label: "지형과 단서를 살펴 안전한 길을 찾는 길 찾기 담당",
        primary: "I",
      },
    ],
  },
  {
    id: 3,
    scene: "코스가 바뀐다",
    story:
      "팀들에게 코스와 현장 상황을 전하던 통신소에서 새로운 방송이 울려 퍼졌다. “아- 아- 오후부터 강한 바람이 불어 전망대 쪽 길의 통행이 어려워졌습니다.” 안내에 따라 코스를 조금 변경해야 할 것 같다. 팀원들은 서로의 얼굴을 바라보며 잠시 생각에 잠겼다.",
    text: "나는 어떤 행동을 할까?",
    type: "choice",
    options: [
      {
        id: "q3-c",
        label: "남은 물품과 시간을 정리하고, 위험요소를 파악한다.",
        primary: "C",
        secondary: "I",
      },
      {
        id: "q3-a",
        label: "새로운 길에 눈에 잘 띄는 표식을 돌과 나뭇가지로 만들어 둔다.",
        primary: "A",
        secondary: "R",
      },
      {
        id: "q3-s",
        label: "친구들의 의견을 귀 기울여 듣고, 모두가 만족할 수 있게 조율한다.",
        primary: "S",
        secondary: "E",
      },
      {
        id: "q3-r",
        label: "머물 자리를 직접 만들고 필요한 물품의 순서를 정리한다.",
        primary: "R",
        secondary: "C",
      },
      {
        id: "q3-e",
        label: "팀이 따라오기 쉬운 새 코스 아이디어를 내고 제안한다.",
        primary: "E",
        secondary: "A",
      },
      {
        id: "q3-i",
        label: "친구들이 말한 걱정거리를 바탕으로 각 코스의 장단점을 비교해 본다.",
        primary: "I",
        secondary: "S",
      },
    ],
  },
  {
    id: 4,
    scene: "도구 창고 앞",
    story:
      "탐험 도중 [도구 창고]가 나타났다. 하지만 창고 안에는 도구가 생각보다 많지 않아, 팀원들은 한 사람당 하나의 도구만 챙겨야 했다. 문 너머로 시선을 돌리자 도구를 대신해 사용할 만한 돌과 튼튼한 나뭇가지들이 보였다.",
    text: "나는 어떤 행동을 할까?",
    type: "choice",
    options: [
      {
        id: "q4-e",
        label: "사람을 모아 역할을 다시 나누고, 같이 움직이게 한다.",
        primary: "E",
        secondary: "S",
      },
      {
        id: "q4-r",
        label: "주변 재료를 직접 써보며 어디에 쓸 수 있을지 확인한다.",
        primary: "R",
        secondary: "I",
      },
      {
        id: "q4-c",
        label: "가진 물건에 표시를 붙이고, 한눈에 보이게 배열한다.",
        primary: "C",
        secondary: "A",
      },
      {
        id: "q4-s",
        label: "지친 친구와 함께 움직이며 필요한 재료를 모은다.",
        primary: "S",
        secondary: "R",
      },
      {
        id: "q4-i",
        label: "지금 꼭 필요한 것과 나중에 필요한 것을 구분한다.",
        primary: "I",
        secondary: "C",
      },
      {
        id: "q4-a",
        label: "추가 도구를 요청하기 위해 주변 재료로 눈에 잘 띄는 신호 표시를 만든다.",
        primary: "A",
        secondary: "E",
      },
    ],
  },
  {
    id: 5,
    scene: "갈림길에서",
    story:
      "도구를 챙긴 팀은 다시 탐험을 이어갔다. 얼마 지나지 않아 갈림길이 모습을 드러냈다. 선선한 숲길은 쉬어 가기에 좋았고, 해안가 돌밭길은 험하지만 더 빨리 목적지에 도착할 수 있다. 어느 길을 선택할지를 두고 팀원들은 쉽게 결정을 내리지 못했다.",
    text: "나는 어떤 행동을 할까?",
    type: "choice",
    options: [
      {
        id: "q5-a",
        label: "생각이 다른 이유를 그림이나 말로 쉽게 풀어 모두가 고개를 끄덕이게 한다.",
        primary: "A",
        secondary: "I",
      },
      {
        id: "q5-e",
        label: "남은 시간과 체력을 고려해 이동 계획을 먼저 세운다.",
        primary: "E",
        secondary: "R",
      },
      {
        id: "q5-s",
        label: "친구들의 의견을 차례로 듣고, 모두가 편하게 이야기할 수 있게 대화를 이끈다.",
        primary: "S",
        secondary: "C",
      },
      {
        id: "q5-i",
        label: "각 길의 장단점과 걱정되는 점을 꼼꼼히 비교한다.",
        primary: "I",
        secondary: "S",
      },
      {
        id: "q5-c",
        label: "두 길의 정보를 한눈에 알 수 있게 정리해 팀원들이 비교하도록 돕는다.",
        primary: "C",
        secondary: "A",
      },
      {
        id: "q5-r",
        label: "말로만 고민하기보다 두 길을 직접 걸어보며 판단한다.",
        primary: "R",
        secondary: "E",
      },
    ],
  },
  {
    id: 6,
    scene: "오늘의 기록",
    story:
      "해가 어느새 수평선 밑으로 내려가고 있다. 팀원들과 돌아온 캠프 앞에는 [오늘의 발견]이라는 자리가 마련되어 있다. 저녁 하늘에 떨어지는 별똥별이 보이기 시작한다. 하루의 마무리에서 오늘의 탐험을 어떻게 남겨볼까?",
    text: "나는 어떤 행동을 할까?",
    type: "choice",
    options: [
      {
        id: "q6-i",
        label: "바람, 지형, 이동 방향을 보고 성공 가능성이 높은 방법을 고른다.",
        primary: "I",
        secondary: "E",
      },
      {
        id: "q6-s",
        label: "친구들 상태를 확인하고, 안전하게 기다릴 위치를 정한다.",
        primary: "S",
        secondary: "I",
      },
      {
        id: "q6-r",
        label: "돌과 천으로 멀리서도 보이는 큰 안내 표식을 만든다.",
        primary: "R",
        secondary: "A",
      },
      {
        id: "q6-c",
        label: "인원과 물품, 기록에 올릴 내용을 확인해 빠짐없이 정리한다.",
        primary: "C",
        secondary: "S",
      },
      {
        id: "q6-a",
        label: "색과 모양을 활용해 한눈에 들어오는 신호를 만든다.",
        primary: "A",
        secondary: "R",
      },
      {
        id: "q6-e",
        label: "누가 무엇을 할지 나누고, 기록을 올리는 행동을 시작하게 한다.",
        primary: "E",
        secondary: "C",
      },
    ],
  },
];
