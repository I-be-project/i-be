# 학교 선택(학교급 토글 + 검색 콤보박스) 설계

작성일: 2026-06-29

## 배경 / 목적

로그인·회원가입 화면의 "학교" 입력은 현재 자유 텍스트 인풋(`components/auth/IdentityFields.tsx`)이다.
오타·표기 불일치로 백엔드 식별 키(`school` 문자열)가 어긋날 수 있다.

대전 지역 중·고등학교 목록(`대전_중고등학교_목록.csv`, 150개교)을 정해진 선택지로 제공한다.
사용자는 **중학교/고등학교를 먼저 고르고**, 해당 학교급 안에서 **검색→선택**한다.

## 데이터

원본 CSV 컬럼: `학교급`, `학교명`, `소재구`, `유형`.
- 학교급: `중학교`(90) / `고등학교`(60)
- 소재구: 동구 / 중구 / 서구 / 유성구 / 대덕구
- 유형: 일반고 / 특성화고 / 특목고(…) / 마이스터고 / 중학교

CSV는 변경되지 않는 정적 데이터이므로 **런타임 파싱 없이 타입 있는 TS 모듈로 1회 변환**해 박아둔다.
변환 후 CSV 원본 파일은 제거한다(재사용 안 함).

`lib/data/schools.ts`:

```ts
export interface School {
  name: string;                     // 학교명 (백엔드 식별 키로 그대로 사용)
  level: "중학교" | "고등학교";      // 학교급 토글 값
  district: string;                 // 소재구 (콤보박스 보조 표시)
  type: string;                     // 유형 (현재 미사용, 보존)
}

export const SCHOOLS: School[];     // 150개, CSV 순서 유지
```

## UI

### SchoolSelect 컴포넌트 (`components/auth/SchoolSelect.tsx`)

`IdentityFields`의 기존 학교 텍스트 인풋을 이 컴포넌트로 교체한다. 두 부분으로 구성:

1. **학교급 토글** — `중학교` / `고등학교` 2-버튼 세그먼트.
   기존 인풋 톤(`bg-zinc-100`, 라운드)과 맞춘 스타일. 선택된 쪽 강조(indigo).
2. **학교 검색·선택 콤보박스** — shadcn `command` + `popover` 기반.
   - 트리거: 기존 인풋 스타일의 버튼. 선택 전 placeholder "학교를 검색해 선택해줘", 선택 후 학교명 표시.
   - 열면 검색 인풋 + 리스트. 토글로 고른 학교급 안에서 `학교명` 부분일치(한글 substring) 필터.
   - 각 항목: 학교명(메인) + 작게 소재구(예: `대전가양중학교` · 작은 글씨 `동구`).
   - 선택 시 `onChange("school", school.name)` 호출, 팝오버 닫힘.
   - 결과 없을 때: "검색 결과가 없어" 안내.

shadcn 컴포넌트 추가: `npx shadcn@latest add command popover` (base-nova 프리셋).

### 상태 (최소 변경)

- `IdentityValues.school: string`은 **그대로 유지** — login/signup의 검증·제출 로직 변경 없음.
- 학교급(level)은 IdentityValues에 저장하지 않고 `SchoolSelect` 내부 로컬 상태로만 관리.
  - 초기값: `values.school`이 비었으면 `중학교`. 이미 값이 있으면 학교명이 "고등학교"로 끝나는지로 학교급 복원.
- 학교급 토글을 바꾸면, 현재 선택된 학교가 새 학교급에 속하지 않으면 선택을 비운다(`onChange("school", "")`).

## 검색 동작

- 한글 부분일치(`name.includes(query)`). 초성검색(예: ㄷㅈ→대전)은 범위 외(YAGNI).
- 공백 trim. 빈 검색어면 해당 학교급 전체 표시.

## 영향 범위

- 신규: `lib/data/schools.ts`, `components/auth/SchoolSelect.tsx`, `components/ui/command.tsx`, `components/ui/popover.tsx`.
- 수정: `components/auth/IdentityFields.tsx` (학교 인풋 → SchoolSelect 교체).
- 제거: `대전_중고등학교_목록.csv`.
- `app/login/page.tsx`, `app/signup/page.tsx`: `IdentityValues`/검증 로직 그대로 → 변경 없음(컴포넌트 교체가 IdentityFields 내부에서 끝남).

## 비범위 (YAGNI)

- 초성검색, 다른 지역 학교, 자유 입력(목록 외 학교) 폴백, 유형 기반 필터.

## 검증

- 로그인/회원가입에서 중→고 토글 전환 시 목록·선택 초기화 동작 확인.
- 검색어 입력 시 실시간 필터, 선택 시 학교명이 식별 키로 정확히 들어가는지 확인.
- `npm run lint`, `npm run build` 통과.
