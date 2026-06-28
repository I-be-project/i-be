-- generated 스키마 — 설문 세션·페르소나·카드(AI 생성 결과).
--
-- 핵심 모델 원칙: "다시 하기"는 기존 세션 UPDATE가 아니라 새 session INSERT.
--   학생 1 : N sessions. 시도마다 새 session 행이 쌓이고 과거 기록은 보존된다.
--   "이 학생이 설문을 완료했는가" = 그 학생의 가장 최근 session.status = 'completed'.
-- session : persona = 1 : 1, persona : card = 1 : 1 (각 UNIQUE FK로 강제).
-- 이 마이그레이션은 테이블 구조만 만든다. 실제 답변·AI 생성으로 채우는 흐름은 별도.

create schema if not exists generated;

-- gen_random_uuid(): Postgres 13+ 코어 내장. 이식성 대비로 pgcrypto도 보장(이미 0001에서 생성).
create extension if not exists pgcrypto;

create table if not exists generated.sessions (
    id           uuid        primary key default gen_random_uuid(),
    student_id   uuid        not null references pii.students (id) on delete cascade,
    status       text        not null
                 check (status in ('in_progress', 'completed', 'abandoned')),
    created_at   timestamptz not null default now(),
    completed_at timestamptz
);

-- 최근 세션 조회(get_latest_for_student): student_id로 필터 + created_at 내림차순.
create index if not exists sessions_student_recent
    on generated.sessions (student_id, created_at desc);

create table if not exists generated.personas (
    id         uuid        primary key default gen_random_uuid(),
    -- 세션과 1:1 — 한 세션에 페르소나 하나.
    session_id uuid        not null unique references generated.sessions (id) on delete cascade,
    name       text        not null,
    tagline    text        not null default '',
    -- app/schemas/persona.py Persona 모델 구조에 맞춤 (문자열 배열).
    keywords   jsonb       not null default '[]'::jsonb,
    fields     jsonb       not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists generated.cards (
    id             uuid        primary key default gen_random_uuid(),
    -- 페르소나와 1:1.
    persona_id     uuid        not null unique references generated.personas (id) on delete cascade,
    -- 최종 카드 이미지 S3 키. 카드 생성 파이프라인이 아직 연결 전이라 nullable.
    card_image_key text,
    created_at     timestamptz not null default now()
);
