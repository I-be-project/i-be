# 진로 내비게이터 — 프로젝트 문서

나Be한마당 페르소나 카드 프로젝트의 **기획·설계·운영 문서 저장소**다.

## 레포 구성

이 프로젝트는 3개 레포로 나뉜다.

| 레포 | 책임 |
|---|---|
| `frontend` | Next.js 16 학생/운영자/관리자 UI |
| `backend` | FastAPI API 서버 + 백그라운드 워커 |
| `docs` (이 레포) | 기획·아키텍처·API 명세·운영 매뉴얼·결정 기록 |

## 디렉토리

```
docs/
├── product/         프로젝트 비전, UX, 성공 기준
├── architecture/    시스템 설계 (현재 backend-design.md 단일 문서)
│   └── diagrams/    손그림 설계도, 다이어그램 source
├── api/             OpenAPI 명세 (예정)
├── operations/      배포·운영 매뉴얼·인시던트 대응 (예정)
├── decisions/       ADR — 결정 기록 (예정)
└── meetings/        회의록
```

## 지금 읽을 문서

- 백엔드 종합 설계: [`architecture/backend-design.md`](architecture/backend-design.md)
- 프로젝트 비전 원본: `../frontend/docs/plan.md` (추후 `product/01-vision.md`로 이전)
- 프론트엔드 개발 계획: `../frontend/docs/dev-plan.md`

## 작성 컨벤션

- 한국어 작성, 마크다운(GitHub Flavored)
- 결정 사항은 ADR로 분리하고, 본문에서 `→ ADR-NNNN`으로 참조
- 이미지·다이어그램은 `architecture/diagrams/`에 보관, 본문에서 상대경로 링크
- 변경 시 문서 하단 "변경 이력" 표 업데이트
