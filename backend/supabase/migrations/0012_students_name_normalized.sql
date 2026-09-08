-- 이름 비교를 공백·대소문자 무시로 바꾼다.
--
-- 배경: 이름이 로그인 식별 키에 들어가면서(0011) 학생이 이름을 한 글자라도
-- 다르게 치면 못 들어온다. 실제 데이터에 'Chia Jen Min'처럼 띄어쓰기 두 군데를
-- 정확히 맞춰야 하는 계정이 있고, 휴대폰 입력에서 앞뒤 공백이 붙기도 쉽다.
--
-- 정규화: lower(regexp_replace(name, '\s+', '', 'g'))
--   'Chia Jen Min' → 'chiajenmin' / '  홍길동  ' → '홍길동' / '이　서연' → '이서연'
--   (\s+는 전각 공백 U+3000도 잡는다)
--
-- 조회만 느슨하게 하고 인덱스를 정확 일치로 두면 안 된다. 'Chia Jen Min'과
-- 'chiajenmin'이 동시에 존재할 수 있게 되고, 그때 조회가 두 행을 다 잡아
-- 임의의 한 명으로 로그인된다 — 0011이 막은 구멍이 그대로 다시 열린다.
-- 그래서 인덱스도 같은 표현식으로 다시 만든다. 조회 쿼리도 이 표현식을 그대로 쓴다
-- (app/repositories/student_repo.py의 _NORM_NAME).
--
-- 적용 시점 기준 정규화 후 중복은 학교 소속·개인 계정 모두 0건이다.

begin;

drop index if exists pii.students_login_key;
drop index if exists pii.students_name_key;

create unique index students_login_key
    on pii.students (
        school, grade, class_no, student_no, (lower(regexp_replace(name, '\s+', '', 'g')))
    )
    where deleted_at is null and kind = 'student';

create unique index students_name_key
    on pii.students ((lower(regexp_replace(name, '\s+', '', 'g'))))
    where deleted_at is null and kind in ('guest', 'test');

commit;
