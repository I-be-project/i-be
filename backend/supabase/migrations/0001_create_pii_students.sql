-- pii.students — 학생 PII(개인식별정보) 테이블.
--
-- 식별 키: (school, grade, class_no, student_no) 조합으로 유니크.
-- 비밀번호는 단순 문자열을 평문 그대로 저장한다(프론트가 "생년월일 형식"으로
-- 안내할 뿐, 백엔드는 의미를 모르고 일반 비밀번호로 취급).
--   주의: 평문 저장이라 DB 덤프·로그 유출 시 비밀번호(=생년월일 PII)가 그대로 노출된다.
-- 사진은 photo_key(Storage 경로)만 보관하며, 실제 파일은 Storage 버킷에 있다.
--
-- 소프트 삭제: deleted_at IS NOT NULL 이면 폐기된 레코드. 유니크는 살아있는
-- 레코드끼리만 적용해(부분 인덱스) 삭제 후 재가입을 막지 않는다.

create schema if not exists pii;

-- gen_random_uuid(): Postgres 13+ 코어에 내장. 구버전/이식성 대비로 pgcrypto도 보장.
create extension if not exists pgcrypto;

create table if not exists pii.students (
    id              uuid        primary key default gen_random_uuid(),
    school          text        not null,
    grade           int         not null,
    class_no        int         not null,
    student_no      int         not null,
    name            text        not null,
    password        text        not null,
    photo_key       text,
    consent_privacy boolean     not null default false,
    created_at      timestamptz not null default now(),
    deleted_at      timestamptz
);

-- 살아있는 학생끼리만 (학교/학년/반/번호) 유니크.
create unique index if not exists students_login_key
    on pii.students (school, grade, class_no, student_no)
    where deleted_at is null;
