-- 초안 품질 평가(O/X/△) — /admin/review에서 여러 검수자가 결과를 채점한다.
-- 승인/반려(status)와는 별개다. 평가는 카드 확정에 영향을 주지 않는다.
alter table generated.persona_drafts
    add column if not exists verdict        text check (verdict in ('o', 'x', 'triangle')),
    add column if not exists verdict_reason text not null default '',
    add column if not exists verdict_at     timestamptz;
