-- 카드 사진 선택(AI 사진 / 캐릭터) — 학생이 홈 팝업에서 한 번만 고른다.
-- 고른 시각이 있으면 다시 고를 수 없다. image_key가 비어 있으면 캐릭터를 고른 것이다.
alter table generated.personas
    add column if not exists photo_chosen_at timestamptz;
