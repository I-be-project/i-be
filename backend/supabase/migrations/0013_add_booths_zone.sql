-- ops.booths — 부스가 속한 존.
--
-- F/L/Y는 직업체험 3개 존, C는 역량체험존이다. 존을 모르는 부스(기존 행 포함)는 ''로 둔다.
-- 존은 4개로 고정이고 이름도 바뀌지 않아 별도 테이블을 두지 않는다. 부스는 존 하나에만
-- 속하므로 연결 테이블도 필요 없다 — 컬럼 하나가 전부다.
-- 인덱스는 두지 않는다. 부스는 행사당 70개 미만이라 순차 조회가 더 싸다.

alter table ops.booths
    add column if not exists zone text not null default '';

alter table ops.booths
    drop constraint if exists booths_zone_valid;

alter table ops.booths
    add constraint booths_zone_valid
    check (zone in ('F', 'L', 'Y', 'C', ''));
