-- generated.answers — 설문 진행 중(Q7~Q9) 학생 선택 답변.
--
-- 저장 원칙:
--   Q1~6은 저장하지 않는다(프론트 메모리 전용). Q7~9만 단계별로 이 테이블에 쌓는다.
--   Q10 선택은 답변이 아니라 최종 persona로 승격되므로 여기 저장하지 않는다.
--   payload에는 "학생이 고른 값"만 담는다(AI 생성 질문 원문은 재생성 가능하므로 제외).
--   같은 세션에서 같은 stage를 다시 제출하면 덮어쓴다(UNIQUE + upsert).
--
-- 세션 생애주기:
--   Q7 첫 저장 시 in_progress 세션이 생기고, 답변은 그 세션에 붙는다.
--   Q10 완료 때 그 세션이 completed로 승격된다(0002의 sessions 참고).

create table if not exists generated.answers (
    id         uuid        primary key default gen_random_uuid(),
    session_id uuid        not null references generated.sessions (id) on delete cascade,
    stage      text        not null
               check (stage in ('q7a', 'q7b', 'q8', 'q9')),
    -- 단계별 선택값(구조가 stage마다 달라 jsonb). personas.keywords와 동일한 규약.
    payload    jsonb       not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    -- 한 세션당 stage 1행 — 재제출은 UPDATE(upsert)로 덮어쓴다.
    unique (session_id, stage)
);

-- 세션의 답변 일괄 조회(list_answers)용.
create index if not exists answers_session
    on generated.answers (session_id);
