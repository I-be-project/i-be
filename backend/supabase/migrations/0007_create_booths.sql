-- ops 스키마 — 행사장 체험 부스.
--
-- code: QR 링크(https://<프론트 오리진>/b/<code>)에 박히는 6자 코드.
--   인쇄물이 이미 현장에 나가 있으므로 발급 후 변경하지 않는다(수정 API에서 제외).
-- is_active 같은 노출 스위치는 두지 않는다. 부스를 막는 수단은 삭제뿐이다.
-- 학생 방문 기록(ops.booth_visits)은 다음 단계이며 이 마이그레이션 범위가 아니다.

create schema if not exists ops;

-- gen_random_uuid(): 0002에서 pgcrypto를 만들지만, 이 파일만 단독 실행해도 되게 보장한다.
create extension if not exists pgcrypto;

create table if not exists ops.booths (
    id          uuid        primary key default gen_random_uuid(),
    code        text        not null unique,
    name        text        not null,
    description text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
