-- pii.students 에 생년월일(birth_date) 컬럼 추가.
--
-- 개인 참여자(kind='guest') 가입 시 이름·성별·비밀번호와 함께 8자리(YYYYMMDD)
-- 숫자 문자열로 입력받아 그대로 저장한다(password/gender와 같은 패턴 —
-- 파싱하지 않는 단순 문자열이며 형식만 CHECK로 강제).
--
-- 학교 소속 학생은 필수가 아니므로 nullable로 둔다.

alter table pii.students
    add column if not exists birth_date text
    check (birth_date is null or birth_date ~ '^[0-9]{8}$');
