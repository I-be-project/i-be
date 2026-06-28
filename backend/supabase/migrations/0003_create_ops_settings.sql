-- ops 스키마 — 행사 전체에 적용되는 운영 설정(전역 key/value).
--
-- retry_enabled: "다시 하기" 버튼 전역 on/off 스위치. 학생 개별 설정이 아니라
--   행사 전체에 적용되는 단일 플래그. 평소 false, 관리자가 켜는 동안만 true.
--   (켜고 끄는 admin API는 별도 담당. 여기선 테이블과 시드만 준비한다.)

create schema if not exists ops;

create table if not exists ops.settings (
    key        text        primary key,
    value      jsonb       not null,
    updated_at timestamptz not null default now()
);

-- 기본값 시드 — 재실행 안전(on conflict do nothing).
insert into ops.settings (key, value)
values ('retry_enabled', 'false'::jsonb)
on conflict (key) do nothing;
