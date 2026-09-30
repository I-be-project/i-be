-- pii.students 에 카드 QR용 짧은 코드(card_code) 추가.
--
-- 카드 QR은 /p/<card_code> 공개 페이지로 연결된다. 기존 공유 코드(UUID+서명, 76자)는
-- QR이 너무 촘촘해져 인쇄 카드(QR 약 7mm)에서 읽히지 않아 8자 랜덤 코드를 따로 둔다.
--
-- 코드는 앱이 처음 필요할 때(카드 합성·프로필 조회) 발급한다(StudentRepository.ensure_card_code).
-- 그래서 백필이 없다. 인쇄된 뒤에는 바꿀 수 없으므로 한 번 채운 값은 갱신하지 않는다.

alter table pii.students
    add column if not exists card_code text;

-- null은 여럿 허용된다(아직 발급 전인 학생).
create unique index if not exists students_card_code_key
    on pii.students (card_code);
