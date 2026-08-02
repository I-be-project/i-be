-- ops 스키마 — 학생의 부스 방문 기록.
--
-- 학생이 부스 QR(/b/<code>)을 찍고 "방문 기록하기"를 누르면 한 행이 쌓인다.
-- (student_id, booth_id) unique — 같은 부스를 여러 번 찍어도 기록은 1건이다.
--   재방문 요청은 에러가 아니라 "이미 기록됨"으로 응답한다(서비스가 처리).
-- 부스를 지우면 그 부스의 방문 기록도 함께 사라진다. 집계 대상이 없어지기 때문이다.
-- 리워드·스탬프 같은 파생 개념은 두지 않는다. 이 테이블은 "누가 어디에 갔는가"만 담는다.

create schema if not exists ops;

-- gen_random_uuid(): 0002에서 pgcrypto를 만들지만, 이 파일만 단독 실행해도 되게 보장한다.
create extension if not exists pgcrypto;

create table if not exists ops.booth_visits (
    id         uuid        primary key default gen_random_uuid(),
    student_id uuid        not null references pii.students (id) on delete cascade,
    booth_id   uuid        not null references ops.booths (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (student_id, booth_id)
);

-- 관리자 "부스별 방문 수" 집계용. unique 제약이 만드는 인덱스는 (student_id, booth_id)
-- 순서라 booth_id 단독 필터에는 쓰이지 않는다.
create index if not exists booth_visits_booth
    on ops.booth_visits (booth_id);
