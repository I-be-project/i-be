-- pii.students 에 성별(gender) 컬럼 추가.
--
-- 값은 'male' / 'female' 만 허용(CHECK). 화면에는 '남'/'여'로 표기하지만
-- 저장 값은 언어 중립적인 영문으로 둔다.
--
-- 기존 행 호환을 위해 nullable 로 둔다(과거 가입자는 성별이 없을 수 있음).
-- 신규 가입은 API 계층(RegisterRequest)에서 필수로 검증하므로 항상 채워진다.

alter table pii.students
    add column if not exists gender text
    check (gender in ('male', 'female'));
