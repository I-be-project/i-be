# 관리자 학생 상세 — 모달에서 사이드바로 설계

작성일: 2026-08-01

## 배경

관리자 화면에서 학생을 클릭하면 중앙 모달(`StudentDetailDialog`)이 열린다. 두 가지 문제가 있다.

1. **사진이 잘린다.** 사진 영역이 `h-64`(256px) 고정인데 모달 폭이 최대 768px(`sm:max-w-3xl`)이라 거의 3:1 띠 모양이고, 거기에 `object-cover`를 써서 정사각 사진의 위아래가 잘려나간다.
2. **한 명 볼 때마다 닫았다 열어야 한다.** 모달이라 오버레이가 뒤를 덮어, 좌석표에서 반 전체를 훑으려면 학생마다 열기·닫기 두 번을 눌러야 한다.

## 사진 비율 조사

사진 업로드 경로가 둘이고 **비율이 보장되지 않는다.**

| 경로 | 결과 |
|---|---|
| 카메라 촬영 (`components/photo/CameraCapture.tsx:369`) | 크롭 단계를 거쳐 720×720 **정사각** |
| 갤러리 파일 선택 (`app/signup/photo/page.tsx:65`, `app/profile/[id]/page.tsx:102`) | **원본 비율 그대로** 업로드 |

따라서 정사각을 가정할 수 없다. 세로·가로 어떤 사진이든 잘리지 않아야 한다.

## 설계

### 1. 모달 → 우측 사이드바

`Dialog`/`DialogContent` → `Sheet`/`SheetContent` (`components/ui/sheet.tsx`, 이미 존재).
`side="right"`, `modal={false}`.

`@base-ui/react`의 `Dialog.Root`가 `modal?: boolean | 'trap-focus'`를 지원한다
(`node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts:36`). `false`면 포커스 트랩·스크롤 잠금·
바깥 포인터 차단이 모두 해제된다.

**오버레이 제거가 필요하다.** `SheetContent`가 `<SheetOverlay />`를 무조건 렌더한다
(`components/ui/sheet.tsx:50`). `showOverlay?: boolean` 옵션을 추가하고 기본값을 `true`로 둬서
기존 동작을 유지한 채, 학생 상세만 `false`로 쓴다.

**폭**: 기본 `sm:max-w-sm`(384px)은 좁다. `sm:max-w-xl`(576px)로 넓힌다.
주의 — 기본 클래스가 `data-[side=right]:sm:max-w-sm`이라 접두사 없는 `sm:max-w-xl`은
CSS 특이도에서 밀린다. `data-[side=right]:sm:max-w-xl`로 접두사를 맞춰야 한다.

**이름**: `StudentDetailDialog` → `StudentDetailSidebar`. import 하는 곳은
`app/admin/page.tsx`와 `app/admin/seating/page.tsx` 두 곳뿐이다.

### 2. 사진 — 정사각 틀 + 전체 맞춤

`h-64` + `object-cover` → **`aspect-square` + `object-contain`**.

정사각 사진(카메라)은 여백 없이 딱 맞고, 그 외 비율만 `bg-muted` 여백이 생긴다.
어느 쪽이든 잘리지 않는다. 576px 폭에서 사진 영역은 576×576이다.

로딩 스켈레톤과 "사진 없음" 상태도 **같은 `aspect-square` 틀**을 쓴다. 상태가 바뀔 때
높이가 튀지 않아야 아래 정보의 위치가 고정된다.

### 3. 닫지 않고 학생 갈아타기

비모달 + 오버레이 제거로 뒤의 목록·좌석표가 계속 클릭된다. 다른 학생을 누르면
사이드바가 닫히지 않고 내용만 교체된다.

이 전환은 이미 안전하다. `detail?.id !== student.id` 가드
(`components/admin/StudentDetailDialog.tsx:255`, 2026-08-01 성능 개선 작업에서 추가)가
정확히 이 경우를 덮어, 새 학생 이름 옆에 이전 학생 사진이 한 프레임도 보이지 않는다.
비모달 전환으로 이 경로가 **드문 일에서 주된 사용 방식으로** 바뀌므로 그 가드가 이제 핵심이 된다.

두 화면 모두 컴포넌트를 공유하므로 자동 적용된다.

## 바꾸지 않는 것

- 내용 구성(이름·학년·반·번호·성별·비밀번호·개인정보 동의·가입일·설문 단계·결과·내용·삭제)
- 삭제 확인 흐름
- 데이터 페칭(상세 조회, 사진 출처, 로딩·에러 처리)
- 백엔드 — 변경 없음

## 트레이드오프 — 좁은 화면

비모달이라 1024px 이하에서는 사이드바가 목록 위를 덮어 "뒤를 클릭한다"는 이점이 줄어든다.
본문을 밀어내는 레이아웃(예: 사이드바가 열리면 목록 영역이 좁아짐)까지 가면 두 페이지의
레이아웃을 모두 손봐야 하므로 이번 범위에서 제외한다. 관리자 화면은 데스크톱에서 쓰는 것이
전제다.

## 검증

프론트엔드에 컴포넌트 테스트 하네스가 없다(`vitest.config.ts`가 `environment: "node"`,
`include`는 `lib/**/*.test.ts`만). 자동 검증은 `npm run lint && npm run test && npm run build`가
전부다. 나머지는 브라우저 확인이 필요하다:

- 정사각 사진이 여백 없이 맞는가
- 세로·가로 사진이 잘리지 않고 전체가 보이는가
- 사진 없는 학생, 로딩 중, 조회 실패 세 상태에서 높이가 동일한가
- 사이드바를 연 채로 다른 학생을 클릭하면 내용만 교체되는가
- 좌석표와 회원 목록 양쪽에서 동일하게 동작하는가
- ESC와 × 버튼으로 닫히는가

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-01 | 최초 작성 |
