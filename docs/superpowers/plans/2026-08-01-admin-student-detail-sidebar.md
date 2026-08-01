# 관리자 학생 상세 사이드바 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 학생 상세를 중앙 모달에서 우측 비모달 사이드바로 옮기고, 사진이 잘리지 않게 정사각 틀에 전체를 맞춰 보여준다.

**Architecture:** 이미 있는 shadcn `Sheet`(내부적으로 `@base-ui/react`의 Dialog)로 교체한다. `modal={false}` + 오버레이 제거로 뒤의 목록·좌석표가 계속 클릭되게 하고, 사진 영역을 `h-64` + `object-cover`(잘림)에서 `aspect-square` + `object-contain`(전체)으로 바꾼다. 백엔드 변경은 없다.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS 4 · shadcn/ui (base-nova) · @base-ui/react

설계 근거와 조사 내용: [`docs/superpowers/specs/2026-08-01-admin-student-detail-sidebar-design.md`](../specs/2026-08-01-admin-student-detail-sidebar-design.md)

## Global Constraints

- **백엔드는 건드리지 않는다.** 이 계획은 프론트엔드 전용이다.
- **내용 구성과 데이터 페칭은 바꾸지 않는다.** 이름·학년·반·번호·성별·비밀번호·개인정보 동의·가입일·설문 단계·결과·내용·삭제 흐름, 상세 조회 로직, 사진 출처(`detail.photo_url`), 로딩·에러 처리 모두 현행 유지. 이 작업은 표현 계층 변경이다.
- **`detail?.id !== student.id` 가드를 절대 제거하지 않는다.** 사이드바가 언마운트되지 않은 채 학생만 바뀌는 전환에서 이전 학생 사진이 새 학생 이름과 함께 노출되는 것을 막는 장치다. 비모달 전환으로 이 경로가 주된 사용 방식이 되므로 더 중요해진다.
- `components/ui/sheet.tsx`에 추가하는 옵션은 **기본값이 현행 동작**이어야 한다(하위 호환).
- UI 텍스트와 코드 주석은 한국어, 주변 스타일에 맞춘다.
- 커밋 메시지: Conventional Commits 접두사 + 한국어 설명. 자동 생성 푸터·서명 금지.
- 모든 명령은 `/Users/imincheol/Develop/i-be/frontend`에서 실행한다.

### 검증 기준선 (2026-08-01 확인)

- `npm run lint` — 오류 0, 경고 4개(전부 `app/explore/*`의 미사용 import). **오류 0을 유지하고 새 경고를 만들지 않는다.**
- `npm run test` — 4개 파일 26개 통과.
- `npm run build` — 성공.
- 프론트엔드에 컴포넌트 테스트 하네스가 없다(`vitest.config.ts`가 `environment: "node"`, `include`는 `lib/**/*.test.ts`만). **하네스를 새로 만들지 않는다.** UI 동작은 브라우저 확인 항목으로 남긴다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `frontend/components/ui/sheet.tsx` | shadcn Sheet 프리미티브. 오버레이를 끌 수 있는 옵션 추가 | 수정 |
| `frontend/components/admin/StudentDetailDialog.tsx` → `StudentDetailSidebar.tsx` | 학생 상세 표현. Dialog → Sheet, 사진 표시 방식 변경 | 수정 후 이름 변경 |
| `frontend/app/admin/page.tsx` | 회원 목록. import 경로·컴포넌트 이름만 | 수정 |
| `frontend/app/admin/seating/page.tsx` | 좌석표. import 경로·컴포넌트 이름만 | 수정 |

신규 파일은 없다.

## Task 순서 근거

Task 1(공용 컴포넌트 옵션)이 Task 2의 전제다. Task 3(리네임)을 분리하는 이유는, 기능 변경 diff와 파일 이름 변경 diff가 한 커밋에 섞이면 리뷰어가 실제 변경을 읽기 어렵기 때문이다.

---

### Task 1: `SheetContent`에 오버레이 끄기 옵션 추가

**Files:**
- Modify: `frontend/components/ui/sheet.tsx:39-56`

**Interfaces:**
- Produces: `SheetContent`의 `showOverlay?: boolean` prop — 기본값 `true`. `false`면 `<SheetOverlay />`를 렌더하지 않아 뒤 화면이 어두워지지 않고 포인터 이벤트도 막히지 않는다.

- [ ] **Step 1: 현재 구조를 확인한다**

`frontend/components/ui/sheet.tsx`의 `SheetContent`를 읽는다. 지금은 `<SheetPortal>` 안에서 `<SheetOverlay />`를 **무조건** 렌더한 뒤 `<SheetPrimitive.Popup>`을 렌더한다. 바꿀 곳은 그 한 줄이다.

- [ ] **Step 2: prop을 추가하고 오버레이를 조건부로 만든다**

`SheetContent`의 시그니처와 오버레이 렌더를 아래처럼 바꾼다. 나머지 본문(`className` 병합, `data-side`, 닫기 버튼)은 그대로 둔다.

```tsx
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  showOverlay = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /**
   * 뒤를 덮는 오버레이를 그릴지. false면 뒤 화면이 어두워지지 않고 클릭도 막히지 않는다.
   * 비모달 시트(<Sheet modal={false}>)와 함께 쓴다. 기본값은 기존 동작 유지.
   */
  showOverlay?: boolean
}) {
  return (
    <SheetPortal>
      {showOverlay && <SheetOverlay />}
      <SheetPrimitive.Popup
```

- [ ] **Step 3: 기존 동작이 그대로인지 확인한다**

Run: `npm run lint && npm run test && npm run build`
Expected: lint 오류 0 / 경고 4(기준선), 26개 테스트 통과, 빌드 성공.

이 단계에서 화면 동작은 아무것도 바뀌지 않아야 한다 — `showOverlay` 기본값이 `true`라 모든 기존 호출부가 이전과 동일하게 렌더된다. `grep -rn "SheetContent" app components --include="*.tsx"`로 현재 호출부가 없다는 것도 확인해 둔다(있다면 영향 없음을 확인).

- [ ] **Step 4: 커밋**

```bash
git add frontend/components/ui/sheet.tsx
git commit -m "feat: Sheet에 오버레이를 끄는 showOverlay 옵션 추가"
```

---

### Task 2: 학생 상세를 비모달 사이드바로 전환하고 사진을 잘림 없이 표시

**Files:**
- Modify: `frontend/components/admin/StudentDetailDialog.tsx:1-24, 243-250, 277-280, 402-403`

**Interfaces:**
- Consumes: `SheetContent`의 `showOverlay` prop (Task 1)
- Produces: 컴포넌트의 외부 인터페이스는 **바뀌지 않는다.** `StudentDetailDialog({ student, onClose, onDeleted })` 그대로다. 호출부는 이 태스크에서 수정하지 않는다.

- [ ] **Step 1: import를 Dialog에서 Sheet로 바꾼다**

파일 상단의 dialog import 블록을 아래로 교체한다.

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
```

- [ ] **Step 2: 루트를 Sheet로 바꾸고 사진 블록을 정사각으로 만든다**

`return (` 다음의 `<Dialog ...>` 여는 태그부터 사진 블록을 닫는 `</div>`까지를 아래로 교체한다.

```tsx
    <Sheet
      open={student !== null}
      // 비모달 — 사이드바를 연 채로 뒤의 목록·좌석표를 그대로 클릭할 수 있다.
      // 다른 학생을 누르면 닫히지 않고 내용만 교체된다.
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        // 바깥 클릭·포커스 이탈로는 닫지 않는다. 뒤의 목록에서 다른 학생을 누르는 것이
        // 주된 사용 방식인데, 그 클릭이 "바깥 클릭 = 닫기"로도 해석되면 닫힘과 새 선택이
        // 경쟁해 사이드바가 사라진다. 닫기는 ESC와 × 버튼으로만 한다.
        if (details.reason === "outside-press" || details.reason === "focus-out") {
          return;
        }
        onClose();
      }}
    >
      <SheetContent
        side="right"
        showOverlay={false}
        // 기본 폭이 sm:max-w-sm(384px)이라 좁다. 접두사 없는 sm:max-w-xl은
        // data-[side=right]:sm:max-w-sm보다 특이도가 낮아 밀리므로 접두사를 맞춘다.
        className="gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl"
      >
        {student && (
          <>
            {/* 사진 — 목록은 사진 URL을 받지 않으므로 상세 응답에서 읽는다.
                정사각 틀 + object-contain이라 어떤 비율이든 잘리지 않는다. 카메라로 찍은
                사진은 720x720이라 여백 없이 맞고, 갤러리에서 고른 사진만 여백이 생긴다.
                로딩·사진없음 상태도 같은 정사각 틀을 써서 전환 시 높이가 튀지 않게 한다. */}
            <div className="relative flex aspect-square w-full items-center justify-center bg-muted">
              {detailError ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              ) : loadingDetail || detail?.id !== student.id ? (
                // detail이 아직 이전 학생 것이거나 로딩 중이면 스켈레톤을 보여준다.
                // (학생을 바꿔도 사이드바가 언마운트되지 않으므로, id가 다르면
                // 이전 학생의 사진이 새 이름과 함께 잠깐 보이는 것을 막아야 한다.)
                <Skeleton className="size-full rounded-none" />
              ) : detail.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.photo_url}
                  alt={`${student.name} 사진`}
                  className="size-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              )}
            </div>
```

바뀐 것은 네 가지다: 루트 태그, `onOpenChange`의 reason 분기, 사진 컨테이너의 `h-64` → `aspect-square w-full`, `<img>`의 `object-cover` → `object-contain`. 분기 구조와 `detail?.id !== student.id` 가드는 그대로다.

`onOpenChange`의 `details.reason`이 왜 필요한지 — `@base-ui/react`는 닫힘 사유를 `'outside-press' | 'escape-key' | 'close-press' | 'focus-out' | 'trigger-press' | 'imperative-action' | 'none'` 중 하나로 넘긴다(`node_modules/@base-ui/react/utils/reason-parts.js`). 비모달에서는 뒤 화면 클릭이 페이지에도 전달되고 동시에 `outside-press` 닫힘도 발생하므로, 그 사유를 걸러내지 않으면 학생을 바꾸려는 클릭이 사이드바를 닫아버린다. 문자열은 케밥 케이스이며 유니온 타입이라 오타는 컴파일에서 잡힌다.

- [ ] **Step 3: 헤더를 SheetHeader/SheetTitle로 바꾼다**

`DialogHeader`/`DialogTitle`을 쓰는 블록을 아래로 교체한다. `SheetHeader`는 기본 `p-4`를 갖는데 이미 `p-6` 안에 들어있으므로 `p-0`으로 끈다.

```tsx
              <SheetHeader className="mb-1 gap-0.5 p-0 text-left">
                <SheetTitle className="text-xl">{student.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{student.school}</p>
              </SheetHeader>
```

- [ ] **Step 4: 닫는 태그를 바꾼다**

파일 끝의 `</DialogContent>` / `</Dialog>`를 `</SheetContent>` / `</Sheet>`로 바꾼다.

- [ ] **Step 5: Dialog 잔재가 없는지 확인한다**

Run: `grep -n "Dialog" frontend/components/admin/StudentDetailDialog.tsx`
Expected: 컴포넌트 이름 `StudentDetailDialog` 외에는 아무 것도 남지 않는다. `@/components/ui/dialog` import, `<Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`이 모두 사라져야 한다.

- [ ] **Step 6: 검증을 돌린다**

Run: `npm run lint && npm run test && npm run build`
Expected: lint 오류 0 / 경고 4(기준선), 26개 통과, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add frontend/components/admin/StudentDetailDialog.tsx
git commit -m "feat: 학생 상세를 우측 비모달 사이드바로 전환하고 사진을 잘림 없이 표시"
```

---

### Task 3: `StudentDetailDialog` → `StudentDetailSidebar` 리네임

**Files:**
- Modify: `frontend/components/admin/StudentDetailDialog.tsx` → `frontend/components/admin/StudentDetailSidebar.tsx`
- Modify: `frontend/app/admin/page.tsx:18, 677`
- Modify: `frontend/app/admin/seating/page.tsx:7, 470`

**Interfaces:**
- Consumes: Task 2가 만든 Sheet 기반 컴포넌트
- Produces: `StudentDetailSidebar({ student, onClose, onDeleted })` — props는 동일, 이름만 변경

- [ ] **Step 1: 파일을 옮긴다**

```bash
cd /Users/imincheol/Develop/i-be
git mv frontend/components/admin/StudentDetailDialog.tsx frontend/components/admin/StudentDetailSidebar.tsx
```

`git mv`를 써야 히스토리가 이어진다.

- [ ] **Step 2: 컴포넌트 이름을 바꾼다**

`frontend/components/admin/StudentDetailSidebar.tsx`에서 `export function StudentDetailDialog({`를 `export function StudentDetailSidebar({`로 바꾼다.

- [ ] **Step 3: 호출부 두 곳을 바꾼다**

`frontend/app/admin/page.tsx`:
```tsx
import { StudentDetailSidebar } from "@/components/admin/StudentDetailSidebar";
```
그리고 JSX의 `<StudentDetailDialog`를 `<StudentDetailSidebar`로 바꾼다.

`frontend/app/admin/seating/page.tsx`:
```tsx
import { StudentDetailSidebar } from "@/components/admin/StudentDetailSidebar";
```
그리고 JSX의 `<StudentDetailDialog`를 `<StudentDetailSidebar`로 바꾼다.

**주의:** `app/admin/page.tsx`는 벌크 삭제 확인용으로 `@/components/ui/dialog`를 계속 쓴다. 그 import와 사용부는 건드리지 않는다 — 파괴적 확인은 모달이 맞다.

- [ ] **Step 4: 옛 이름이 남아있지 않은지 확인한다**

Run: `grep -rn "StudentDetailDialog" frontend --include="*.tsx" --include="*.ts" | grep -v node_modules`
Expected: 결과 없음.

- [ ] **Step 5: 검증을 돌린다**

Run: `npm run lint && npm run test && npm run build`
Expected: lint 오류 0 / 경고 4(기준선), 26개 통과, 빌드 성공. 빌드가 통과한다는 것은 import 경로가 모두 맞았다는 뜻이다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/components/admin/StudentDetailSidebar.tsx frontend/app/admin/page.tsx frontend/app/admin/seating/page.tsx
git commit -m "refactor: StudentDetailDialog를 StudentDetailSidebar로 이름 변경"
```

---

## 브라우저 확인 (사람이 직접, 구현 에이전트는 수행 불가)

자동 테스트가 덮지 못하는 부분이다. 백엔드(`cd backend && uv run uvicorn app.main:app --reload`)와 프론트(`cd frontend && npm run dev`)를 띄우고 `http://localhost:4000/admin`에서 확인한다.

- [ ] 학생을 클릭하면 오른쪽에서 사이드바가 밀려 나온다
- [ ] 카메라로 찍은 정사각 사진이 **여백 없이** 정사각 영역을 꽉 채운다
- [ ] 갤러리에서 올린 세로 사진이 **잘리지 않고** 좌우 여백과 함께 전체가 보인다
- [ ] 사진 없는 학생, 로딩 중, 조회 실패 세 상태에서 사진 영역 높이가 동일하다(아래 정보가 위아래로 튀지 않는다)
- [ ] 사이드바가 열린 채로 **뒤의 목록 행을 클릭**하면 닫히지 않고 내용만 바뀐다
- [ ] 학생을 바꿀 때 이전 학생 사진이 새 이름과 함께 보이는 순간이 **없다**
- [ ] `/admin/seating`에서도 동일하게 동작한다(좌석 셀 클릭 → 사이드바 → 다른 셀 클릭)
- [ ] ESC와 우상단 × 버튼으로 닫힌다
- [ ] 사이드바 **바깥의 빈 영역**을 클릭해도 닫히지 않는다(의도된 동작 — 바깥 클릭으로 닫으면 다른 학생을 고르는 클릭과 충돌한다)
- [ ] 회원 삭제 확인 흐름이 사이드바 안에서 그대로 동작한다
- [ ] 벌크 삭제 확인 다이얼로그는 여전히 **중앙 모달**이다(사이드바로 바뀌지 않았다)

닫기 × 버튼이 사진 위에 겹치는데, `variant="ghost"`라 밝은 사진에서는 잘 안 보일 수 있다. 기존 모달도 같은 구조였으므로 회귀는 아니지만, 눈에 거슬리면 별도 작업으로 배경을 넣는다.

## 범위 밖

- 좁은 화면에서 사이드바가 목록을 덮는 문제 — 본문을 밀어내는 레이아웃은 두 페이지를 모두 손봐야 해서 제외한다. 관리자 화면은 데스크톱 사용이 전제다.
- 사이드바 안에서 이전/다음 학생으로 이동하는 버튼
- 컴포넌트 테스트 하네스 도입
- 닫기 버튼 스타일 개선

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-01 | 최초 작성 |
