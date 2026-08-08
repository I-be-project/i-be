-- pii.students 에 계정 종류(kind) 추가.
--
-- 'student' : 학교 소속 학생 (기존 전원 — 기본값으로 백필된다)
-- 'guest'   : 학교 없는 개인·성인 참여자
-- 'test'    : 관리자가 발급한 테스트 계정 (학생 로그인 화면으로 진입 불가)
--
-- guest·test는 학교가 없어 school=''·grade/class_no/student_no=0 으로 저장한다.
-- 그 값으로는 기존 유니크가 성립하지 않으므로 인덱스를 둘로 나눈다.
--   - 학교 소속: (school, grade, class_no, student_no)
--   - 학교 없음: (name) — 동명이인 가입을 막아 이름 로그인을 확정적으로 만든다
-- guest와 test가 같은 이름 공간을 쓴다. 로그인은 guest만 조회하므로 모호해지지 않지만,
-- 관리자 목록에 같은 이름이 둘 보이는 혼동을 막기 위해 공통으로 둔다.

alter table pii.students
    add column if not exists kind text not null default 'student'
    check (kind in ('student', 'guest', 'test'));

-- DROP과 CREATE를 한 트랜잭션으로 묶는다. 트랜잭션이 테이블 쓰기를 잠그므로
-- 인덱스가 없는 순간에 중복 가입이 끼어들 창이 생기지 않는다.
begin;

drop index if exists pii.students_login_key;

create unique index students_login_key
    on pii.students (school, grade, class_no, student_no)
    where deleted_at is null and kind = 'student';

create unique index students_name_key
    on pii.students (name)
    where deleted_at is null and kind in ('guest', 'test');

commit;
