-- 페르소나·카드 일괄 생성 + 검수.
-- 로컬 codex가 세션별 초안(drafts)을 만들고, 개발자가 /dev/review에서 검수·승인하면
-- generated.personas / generated.cards로 확정한다. 학생 화면·인쇄는 확정본만 읽는다.

-- 확정본에 카드 문구·생성 이미지를 담을 컬럼.
alter table generated.personas
    add column if not exists base_career        text        not null default '',
    add column if not exists headline           text        not null default '',
    add column if not exists source_career_pool boolean,
    add column if not exists pool_extended      boolean,
    add column if not exists image_key          text,
    add column if not exists approved_at        timestamptz;

create table if not exists generated.persona_drafts (
    id                 uuid        primary key default gen_random_uuid(),
    -- 세션당 초안 하나. 재생성은 새 행이 아니라 이 행을 갱신한다.
    session_id         uuid        not null unique references generated.sessions (id) on delete cascade,
    student_id         uuid        not null references pii.students (id) on delete cascade,
    status             text        not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
    -- 카드 문구. 카드 하단은 headline(윗줄) + base_career(아랫줄).
    name               text        not null default '',
    base_career        text        not null default '',
    headline           text        not null default '',
    tagline            text        not null default '',
    source_career_pool boolean,
    pool_extended      boolean,
    -- codex 출력 원본(q8/q9 반영 근거 포함). 추적용.
    raw                jsonb       not null default '{}'::jsonb,
    -- 생성 이미지 S3 키. 이미지 생성이 실패하면 null로 남고 error에 사유가 남는다.
    image_key          text,
    error              text,
    note               text        not null default '',
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    reviewed_at        timestamptz
);

create index if not exists persona_drafts_status
    on generated.persona_drafts (status, created_at);
