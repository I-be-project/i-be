-- 학교 소속 학생의 식별 키에 이름을 추가한다.
--
-- 배경: 현장에서 반·번호가 겹치는 가입을 막지 못해(번호 오기입, 번호를 모르는 학생 등)
-- 가입 자체가 거부되는 일이 있었다. 반·번호 중복을 허용하되, 로그인이 계정을
-- 확정적으로 특정하도록 이름을 식별 키에 넣는다.
--
--   before: (school, grade, class_no, student_no)
--   after : (school, grade, class_no, student_no, name)
--
-- 이름만 추가하는 것으로 충분한 이유: 같은 반 동명이인이 실제로 존재하지만(5쌍)
-- 전원 번호가 달라, 다섯 값을 모두 합치면 유일해진다. 적용 시점 기준 학교 소속
-- 4320행에서 (school, grade, class_no, student_no, name) 중복은 0건이다.
--
-- 이 변경 이후 학교 소속 학생도 로그인에 이름을 입력해야 한다(LoginRequest).

begin;

drop index if exists pii.students_login_key;

create unique index students_login_key
    on pii.students (school, grade, class_no, student_no, name)
    where deleted_at is null and kind = 'student';

commit;
