-- 요청 키는 세션 삭제 후에도 남겨 오래된 재전송이 새 설문을 만들지 못하게 한다.
create table if not exists generated.survey_requests (
    student_id uuid not null references pii.students(id) on delete cascade,
    request_id uuid not null,
    session_id uuid references generated.sessions(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (student_id, request_id)
);

-- 교체/실패 업로드 정리. 삭제 실패 시 행을 유지하고 워커가 재시도한다.
create table if not exists generated.photo_cleanup (
    photo_key text primary key,
    created_at timestamptz not null default now()
);
