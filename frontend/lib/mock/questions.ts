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
      "배가 선착장에 닿자, 바닷소금 냄새와 깃발 소리가 섞여 들려온다. 멀리 캠프 광장엔 아직 낮 등불이 꺼져 있고, 안내단 선배가 손을 흔든다. 팀원들도 하나둘 내리기 시작했다.",
    text: "가장 먼저 손이 가는 일은?",
    type: "choice",
    options: [
      { id: "q1-s", label: "친구들이 멀미는 없는지, 다들 괜찮은지 살핀다.", primary: "S" },
      { id: "q1-i", label: "지도와 주변 풍경을 비교해 지금 위치를 짐작한다.", primary: "I" },
      { id: "q1-a", label: "깃발이나 표식으로 우리 팀만의 출발 표시를 만든다.", primary: "A" },
      { id: "q1-c", label: "가방과 장비를 한곳에 모아 빠진 것이 없는지 본다.", primary: "C" },
      { id: "q1-r", label: "돗자리나 끈을 꺼내 임시로 머물 자리를 만들어본다.", primary: "R" },
      { id: "q1-e", label: "먼저 어디를 둘러볼지 말하고 친구들을 모은다.", primary: "E" },
    ],
  },
  {
    id: 2,
    scene: "역할 정하기",
    story:
      "광장 한가운데, 너희 팀만의 이름표를 붙일 자리가 마련됐다. 안내단 선배가 말한다. “낮 코스는 팀이 함께할수록 재미있어. 각자 맡을 역할을 정해 볼까?”",
    text: "자연스럽게 맡고 싶은 역할은?",
    type: "choice",
    options: [
      { id: "q2-c", label: "탐험 시간과 준비물을 체크하는 기록 담당", primary: "C" },
      { id: "q2-a", label: "길 표시와 팀 깃발을 보기 좋게 만드는 표시 담당", primary: "A" },
      { id: "q2-s", label: "친구들의 컨디션과 분위기를 살피는 케어 담당", primary: "S" },
      { id: "q2-r", label: "짐을 옮기고 현장에서 필요한 것을 만드는 준비 담당", primary: "R" },
      { id: "q2-e", label: "다음 이동 방향을 제안하고 팀을 모으는 진행 담당", primary: "E" },
      { id: "q2-i", label: "지형과 단서를 살펴 안전한 길을 찾는 탐색 담당", primary: "I" },
    ],
  },
  {
    id: 3,
    scene: "코스가 바뀐다",
    story:
      "오후가 되자 안내소에서 코스를 조금 바꾸자고 했다. 바람이 세게 불어 전망대 쪽 길이 막혔다는 소식이다. 팀원들의 표정이 조금씩 달라진다 — 어떻게 맞출지 정해야 한다.",
    text: "나는 어떻게 할까?",
    type: "choice",
    options: [
      { id: "q3-c", label: "남은 물품과 시간을 살피고, 빠진 위험요소를 표시한다.", primary: "C", secondary: "I" },
      { id: "q3-a", label: "눈에 잘 띄는 표식을 그리고, 돌과 나뭇가지로 완성한다.", primary: "A", secondary: "R" },
      { id: "q3-s", label: "친구들 의견을 먼저 듣고, 다 같이 할 수 있는 방식으로 맞춘다.", primary: "S", secondary: "E" },
      { id: "q3-r", label: "머물 자리를 직접 만들면서 필요한 순서도 함께 잡는다.", primary: "R", secondary: "C" },
      { id: "q3-e", label: "팀이 따라오기 쉬운 새 코스 아이디어를 내고 제안한다.", primary: "E", secondary: "A" },
      { id: "q3-i", label: "어느 길이 안전한지 살피고, 친구들이 걱정하는 점도 확인한다.", primary: "I", secondary: "S" },
    ],
  },
  {
    id: 4,
    scene: "도구 창고 앞",
    story:
      "도구 창고 앞에서 팀 도구를 나눠 받았다. 생각보다 적어서, 한 사람당 하나씩만 들고 가야 한다. 창고 문 너머로 야외 작업장의 나뭇가지 더미가 보인다.",
    text: "나는 어떻게 할까?",
    type: "choice",
    options: [
      { id: "q4-e", label: "사람을 모아 역할을 다시 나누고, 같이 움직이게 한다.", primary: "E", secondary: "S" },
      { id: "q4-r", label: "주변 재료를 직접 써보며 어디에 쓸 수 있을지 확인한다.", primary: "R", secondary: "I" },
      { id: "q4-c", label: "가진 물건에 표시를 붙이고, 한눈에 보이게 배열한다.", primary: "C", secondary: "A" },
      { id: "q4-s", label: "지친 친구와 함께 움직이며 필요한 재료를 모은다.", primary: "S", secondary: "R" },
      { id: "q4-i", label: "지금 꼭 필요한 것과 나중에 필요한 것을 구분한다.", primary: "I", secondary: "C" },
      { id: "q4-a", label: "천, 돌, 나뭇잎으로 멀리서도 보이는 신호물을 구상한다.", primary: "A", secondary: "E" },
    ],
  },
  {
    id: 5,
    scene: "갈림길에서",
    story:
      "야외 작업장 근처 갈림길에서 의견이 갈렸다. 한쪽은 숲길, 다른 쪽은 해안 쪽 돌밭이다. 누군가는 빨리 가자고, 누군가는 조금 쉬자고 한다.",
    text: "나는 어떻게 할까?",
    type: "choice",
    options: [
      { id: "q5-a", label: "서로 다른 생각을 그림이나 말로 풀어 보여주고 차이를 짚는다.", primary: "A", secondary: "I" },
      { id: "q5-e", label: "선택지를 두세 개로 줄이고, 바로 시도할 방법을 제안한다.", primary: "E", secondary: "R" },
      { id: "q5-s", label: "감정이 상한 친구 이야기를 듣고, 말할 순서를 차분히 잡는다.", primary: "S", secondary: "C" },
      { id: "q5-i", label: "각 의견의 이유를 따져보고, 걱정되는 점도 함께 확인한다.", primary: "I", secondary: "S" },
      { id: "q5-c", label: "나온 의견을 표나 그림으로 정리해 모두가 볼 수 있게 한다.", primary: "C", secondary: "A" },
      { id: "q5-r", label: "계속 말로만 정하기보다, 가능한 방법을 먼저 시험해본다.", primary: "R", secondary: "E" },
    ],
  },
  {
    id: 6,
    scene: "오늘의 기록",
    story:
      "해가 지기 전, 캠프로 돌아왔다. 게시판 앞에 오늘의 발견을 붙일 자리가 비어 있다. 멀리 저녁 하늘에 첫 별빛이 보이기 시작한다 — 오늘의 탐험을 어떻게 남길까?",
    text: "나는 어떻게 할까?",
    type: "choice",
    options: [
      { id: "q6-i", label: "바람, 지형, 이동 방향을 보고 성공 가능성이 높은 방법을 고른다.", primary: "I", secondary: "E" },
      { id: "q6-s", label: "친구들 상태를 확인하고, 안전하게 기다릴 위치를 정한다.", primary: "S", secondary: "I" },
      { id: "q6-r", label: "돌과 천으로 멀리서도 보이는 큰 안내 표식을 만든다.", primary: "R", secondary: "A" },
      { id: "q6-c", label: "인원과 물품, 기록에 올릴 내용을 확인해 빠짐없이 정리한다.", primary: "C", secondary: "S" },
      { id: "q6-a", label: "색과 모양을 활용해 한눈에 들어오는 신호를 만든다.", primary: "A", secondary: "R" },
      { id: "q6-e", label: "누가 무엇을 할지 나누고, 기록을 올리는 행동을 시작하게 한다.", primary: "E", secondary: "C" },
    ],
  },
];
