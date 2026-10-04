-- ops.booths — 부스 상세 설명.
--
-- description은 목록·카드에 쓰는 한 줄 요약(직업체험은 기관명, 역량체험은 미션 활동)이고,
-- detail은 부스에서 무엇을 하는지 길게 적는 본문이다. 없으면 null.

alter table ops.booths
    add column if not exists detail text;
