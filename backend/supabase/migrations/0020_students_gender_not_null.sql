-- pii.students.gender NOT NULL.
-- 0006에서 과거 가입자 호환을 위해 nullable로 뒀지만, 가입 API가 성별을 필수로 받아
-- 실제 빈 값은 0건이다(2026-10-07 확인). 외부 전달 API(/api/export/v1)가 gender를
-- 필수 필드로 약속하므로 DB에서도 보장한다.
alter table pii.students alter column gender set not null;
