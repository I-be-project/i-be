# 3-repo → monorepo 통합 — 설계서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-07-01 |
| 상태 | Draft — 구현 전 합의 |
| 대상 | `backend`, `frontend`, `docs` → 새 `I-be-project/i-be` (private) |

## 1. 목표 / 비목표

**목표**
- 3개 GitHub repo(backend/frontend/docs)를 **전체 커밋 히스토리 보존**하며 단일 monorepo로 병합.
- 새 원격: `I-be-project/i-be` (private).
- 결과 레이아웃: 서브디렉터리 `backend/`, `frontend/`, `docs/`.

**비목표(이번 범위 밖)**
- 루트 느슨한 파일(`Future-Me Lab/`, CSV, 회의정리 md) 포함 — 제외.
- 기존 3개 repo archive 처리.
- 기존 로컬 `i-be/` 폴더 in-place 전환.
- CI/배포 경로 수정, 워크스페이스 도구(pnpm/uv workspace) 도입.

## 2. 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 히스토리 **전체 보존**(경로 이동) | 아카이브 문제·추적성 |
| D-2 | 도구 = **git-filter-repo** (`brew install`) | 과거 커밋 경로까지 `backend/…`로 재작성 → blame/log 최상 |
| D-3 | 소스 팁: backend=`production`, frontend=`main`, docs=`main` | backend production이 main을 완전히 포함(21커밋 앞섬, 손실 0) |
| D-4 | 소스는 **GitHub 원격에서 mirror clone** | 방금 머지한 PR 상태 반영, 로컬 미커밋 영향 배제 |
| D-5 | monorepo는 **임시 작업공간에서 조립 → push → 새 폴더 clone** | 기존 로컬/원격 무손상 |
| D-6 | monorepo 기본 브랜치 = `main` | 관례 |

## 3. 최종 레이아웃

```
i-be/                        (새 git repo, 기본 브랜치 main)
  backend/     ← backend  production 히스토리 (경로 재작성)
  frontend/    ← frontend main 히스토리
  docs/        ← docs     main 히스토리
  .gitignore   node_modules/ .venv/ .DS_Store .obsidian/ .claude/ .superpowers/ __pycache__/ *.pyc .env* next-env.d.ts tsconfig.tsbuildinfo
  README.md    monorepo 개요 + 각 서브프로젝트 링크
  docs/superpowers/specs/2026-07-01-monorepo-consolidation-design.md  (이 문서 사본)
```

> 주의: 각 소스 repo는 이미 자체 `.gitignore` 보유(backend/frontend). 서브디렉터리 이동 시 그대로 딸려와 각 하위에서 계속 유효. 루트 `.gitignore`는 공통/툴 항목만 담당(중복 무해).

## 4. 절차

1. **사전**: `brew install git-filter-repo` 로 도구 설치·확인.
2. **작업공간**: 임시 경로 `WORK`에 세 소스를 각각 mirror clone.
   - `git clone https://github.com/I-be-project/backend.git` 등.
3. **경로 재작성**(각 clone에서):
   - backend: `git filter-repo --to-subdirectory-filter backend`
   - frontend: `git filter-repo --to-subdirectory-filter frontend`
   - docs: `git filter-repo --to-subdirectory-filter docs`
4. **병합**: 새 `i-be` repo `git init`(브랜치 main) →
   - 각 재작성 clone을 remote로 add → fetch →
   - backend는 `production`, frontend/docs는 `main`을 `git merge --allow-unrelated-histories`.
5. **루트 파일**: `.gitignore`, `README.md`, 설계서 사본 추가 후 커밋.
6. **원격 생성·push**: `gh repo create I-be-project/i-be --private --source . --remote origin --push` (또는 create 후 `git push -u origin main`).
7. **검증**:
   - 세 서브디렉터리 파일 존재, `git log -- backend/` 등에 과거 커밋 보임.
   - backend 테스트: `cd backend && uv run pytest -q` (OpenRouter 미호출).
   - frontend 테스트: `cd frontend && npx vitest run`.
8. **최종 로컬**: 별도 경로(예: `~/Develop/i-be-mono`)로 `git clone` 해 작업 사본 확보.

## 5. 리스크 / 대응

| 리스크 | 대응 |
|---|---|
| filter-repo 설치 실패(brew 미보유 등) | 대안: `git subtree add --prefix`(무설치, 과거 경로 유지). 사용자 확인 후 전환 |
| 병합 후 파일 누락/경로 오류 | push 전 트리·로그 검증 단계(§4-7). 문제 시 원격 무손상이라 재작업 가능 |
| 서브디렉터리 `.gitignore`가 상위 파일 무시 | 각 `.gitignore`는 상대 경로 기준이라 하위에서만 작동, 문제 없음 |
| node_modules/.venv가 히스토리에 있었음 | 소스 repo가 이미 무시 중이라 히스토리에 없음(확인됨: 둘 다 .gitignore 보유) |

## 6. 검증 기준(완료 정의)

- `I-be-project/i-be` (private) 생성, `main` push 완료.
- monorepo에 backend/frontend/docs 서브디렉터리 존재 + 각 과거 히스토리 조회 가능.
- backend pytest·frontend vitest 통과.
- 기존 3개 repo·로컬 `i-be/` 무손상.
