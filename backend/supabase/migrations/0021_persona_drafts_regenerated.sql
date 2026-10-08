-- /dev/review에서 다시 만든 초안을 재검수 대상으로 모으기 위한 기록.
-- 재생성이 성공하면 O/X/△ 평가가 지워지므로(0019), 지우기 전의 평가·이유를 남겨
-- 다시 검수할 때 무엇이 문제였는지 보이게 한다.
alter table generated.persona_drafts
    add column if not exists regenerated_at      timestamptz,
    add column if not exists prev_verdict        text check (prev_verdict in ('o', 'x', 'triangle')),
    add column if not exists prev_verdict_reason text not null default '';
